import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NewTransactionModal } from "./NewTransactionModal";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

function asRoles(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({ user: { roles } } as unknown as ReturnType<typeof useAuth>);
}

const categories = [
  {
    id: "c1",
    name: "Dízimos",
    type: "income" as const,
    children: [{ id: "c1a", name: "Dízimo online", type: "income" as const, children: [] }],
  },
  { id: "c2", name: "Aluguel", type: "expense" as const, children: [] },
];

function mockApiGet(overrides: { costCenters?: unknown[] } = {}) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/financial/cost-centers") {
      return Promise.resolve({ data: overrides.costCenters ?? [] });
    }
    return Promise.resolve({ data: categories });
  });
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  // Espera a resposta de categorias virar opção do select — não só a chamada
  // ao mock. Quem chama costuma ter feito `waitFor(api.get chamado)`, que
  // libera antes do render seguinte; em runner lento o select ainda estava
  // só com "— Selecione —" (falhou no CI do PR #154).
  await screen.findByRole("option", { name: "Dízimos" });
  await user.selectOptions(screen.getAllByRole("combobox")[0], "c1");
  await user.type(screen.getByLabelText(/Valor/), "1000");
  // A descrição já vem sugerida (categoria + mês); aqui o teste escreve a sua.
  await user.clear(screen.getByLabelText(/Descrição/));
  await user.type(screen.getByLabelText(/Descrição/), "Dízimos do culto");
}

describe("NewTransactionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet();
    asRoles(["tenant_admin"]);
  });

  it("does not render form fields when closed", () => {
    render(<NewTransactionModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
  });

  it("loads categories filtered by type and validates required fields", async () => {
    const user = userEvent.setup();
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    // `findAllByText` espera o render aplicar a resposta do `api.get` — um
    // `getAllByText` logo depois do `waitFor` da chamada do mock pega a
    // janela entre a resposta resolver e o próximo render, intermitente.
    expect((await screen.findAllByText("Dízimos")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Aluguel")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar" }));
    expect(await screen.findByText("Descrição é obrigatória.")).toBeInTheDocument();
  });

  it("renders category children as options and validates amount, date and category", async () => {
    const user = userEvent.setup();
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(screen.getByRole("option", { name: /Dízimo online/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Descrição/), "Algo");
    await user.click(screen.getByRole("button", { name: "Registrar" }));
    expect(await screen.findByText("Informe um valor válido.")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Valor/), "1000");
    const dateInput = screen.getByLabelText(/Data/) as HTMLInputElement;
    await user.clear(dateInput);
    await user.click(screen.getByRole("button", { name: "Registrar" }));
    expect(await screen.findByText("Data é obrigatória.")).toBeInTheDocument();

    await user.type(dateInput, "2026-02-01");
    await user.click(screen.getByRole("button", { name: "Registrar" }));
    expect(await screen.findByText("Selecione uma categoria.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a single transaction and shows success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <NewTransactionModal open={true} onOpenChange={onOpenChange} onCreated={onCreated} />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/transactions",
        expect.objectContaining({
          type: "income",
          category_id: "c1",
          amount: 10,
          description: "Dízimos do culto",
        })
      )
    );

    expect(await screen.findByText("Lançamento registrado!")).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(1200);
    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.useRealTimers();
  });

  it("sends the selected cost center when creating a single transaction", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApiGet({ costCenters: [{ id: "cc1", name: "Missões" }] });
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));

    await fillRequiredFields(user);
    await user.selectOptions(screen.getByLabelText(/Centro de custo/), "cc1");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/transactions",
        expect.objectContaining({ cost_center_id: "cc1" })
      )
    );
    vi.useRealTimers();
  });

  it("does not render the cost center field when none is registered", async () => {
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/cost-centers"));

    expect(screen.queryByLabelText(/Centro de custo/)).not.toBeInTheDocument();
  });

  it("switches to expense type and filters categories accordingly", async () => {
    const user = userEvent.setup();
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Saída" }));

    expect(screen.getAllByText("Aluguel").length).toBeGreaterThan(0);
    expect(screen.queryByText("Dízimos")).not.toBeInTheDocument();
  });

  it("creates an installment plan via recurring-rules", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await fillRequiredFields(user);
    await user.selectOptions(screen.getAllByRole("combobox")[1], "installment");
    await user.clear(screen.getByLabelText(/Número de parcelas/));
    await user.type(screen.getByLabelText(/Número de parcelas/), "6");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/recurring-rules",
        expect.objectContaining({ mode: "installment", installments: 6 })
      )
    );
    expect(
      await screen.findByText("Lançamento parcelado em 6x criado com sucesso")
    ).toBeInTheDocument();
  });

  it("validates installment count range", async () => {
    const user = userEvent.setup();
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await fillRequiredFields(user);
    await user.selectOptions(screen.getAllByRole("combobox")[1], "installment");
    await user.clear(screen.getByLabelText(/Número de parcelas/));
    await user.type(screen.getByLabelText(/Número de parcelas/), "1");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    expect(
      await screen.findByText("Número de parcelas deve ser entre 2 e 60.")
    ).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a fixed monthly entry via recurring-rules", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await fillRequiredFields(user);
    await user.selectOptions(screen.getAllByRole("combobox")[1], "fixed");
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/recurring-rules",
        expect.objectContaining({ mode: "fixed" })
      )
    );
    expect(
      await screen.findByText("Lançamento fixo mensal criado com sucesso")
    ).toBeInTheDocument();
  });

  it("shows an error message when the API call fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("fail"));
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    expect(
      await screen.findByText("Erro ao registrar lançamento. Tente novamente.")
    ).toBeInTheDocument();
  });

  it("pre-fills the form when editing a transaction and patches with the scope", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const editTransaction = {
      id: "tx1",
      type: "income" as const,
      amount: "50.00",
      occurred_at: "2026-01-15T12:00:00.000Z",
      description: "Oferta especial",
      category_id: "c1",
      recurring_rule_id: "rr1",
    };

    render(
      <NewTransactionModal
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        editTransaction={editTransaction}
        scope="this_and_future"
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(screen.getByDisplayValue("Oferta especial")).toBeInTheDocument();
    expect(
      screen.getByText("Este lançamento faz parte de uma série recorrente.")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/financial/transactions/tx1?scope=this_and_future",
        expect.objectContaining({ description: "Oferta especial" })
      )
    );
    expect(
      await screen.findByText("Lançamento e próximos atualizados com sucesso")
    ).toBeInTheDocument();
  });

  it("renders as read-only with a single close action when viewOnly is true", async () => {
    const user = userEvent.setup();
    const editTransaction = {
      id: "tx1",
      type: "income" as const,
      amount: "50.00",
      occurred_at: "2026-01-15T12:00:00.000Z",
      description: "Oferta especial",
      category_id: "c1",
    };
    render(
      <NewTransactionModal
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        editTransaction={editTransaction}
        viewOnly={true}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    const closeButtons = screen.getAllByRole("button", { name: "Fechar" });
    expect(closeButtons.length).toBe(2);
    expect(screen.queryByRole("button", { name: "Salvar" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Descrição/)).toBeDisabled();

    const onOpenChange = vi.fn();
    render(
      <NewTransactionModal
        open={true}
        onOpenChange={onOpenChange}
        onCreated={vi.fn()}
        editTransaction={editTransaction}
        viewOnly={true}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    const formCloseButton = screen.getAllByRole("button", { name: "Fechar" })[1];
    await user.click(formCloseButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cancels the form without submitting and resets on close", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<NewTransactionModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.type(screen.getByLabelText(/Descrição/), "Rascunho");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("resets the form when closed via the modal's close button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<NewTransactionModal open={true} onOpenChange={onOpenChange} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("labels an editing transaction with an installment description as 'Parcelado'", async () => {
    const editTransaction = {
      id: "tx2",
      type: "income" as const,
      amount: "10.00",
      occurred_at: "2026-01-15T12:00:00.000Z",
      description: "Dízimos (2/6)",
      category_id: null,
      recurring_rule_id: "rr2",
    };
    render(
      <NewTransactionModal
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        editTransaction={editTransaction}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(screen.getByDisplayValue("Parcelado")).toBeInTheDocument();
  });

  it("keeps the categories list empty when the request has no data", async () => {
    vi.mocked(api.get).mockResolvedValue({});
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(screen.queryByRole("option", { name: /Dízimo online/ })).not.toBeInTheDocument();
  });

  it("does not crash when loading categories fails", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network"));
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    expect(screen.queryByRole("option", { name: /Dízimo online/ })).not.toBeInTheDocument();
  });

  it("edits a transaction without a scope and shows the generic success message", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockResolvedValue({ data: {} });
    const editTransaction = {
      id: "tx3",
      type: "income" as const,
      amount: "50.00",
      occurred_at: "2026-01-15T12:00:00.000Z",
      description: "Oferta especial",
      category_id: "c1",
    };

    render(
      <NewTransactionModal
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        editTransaction={editTransaction}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith(
        "/financial/transactions/tx3",
        expect.objectContaining({ description: "Oferta especial" })
      )
    );
    expect(
      await screen.findByText("Lançamento atualizado com sucesso")
    ).toBeInTheDocument();
  });

  it("shows an error message when updating a transaction fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockRejectedValue(new Error("fail"));
    const editTransaction = {
      id: "tx4",
      type: "income" as const,
      amount: "50.00",
      occurred_at: "2026-01-15T12:00:00.000Z",
      description: "Oferta especial",
      category_id: "c1",
    };

    render(
      <NewTransactionModal
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        editTransaction={editTransaction}
      />
    );
    await waitFor(() => expect(api.get).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(
      await screen.findByText("Erro ao atualizar lançamento. Tente novamente.")
    ).toBeInTheDocument();
  });
});

describe("NewTransactionModal — descrição sugerida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet();
    asRoles(["tenant_admin"]);
  });

  async function openAndPick(user: ReturnType<typeof userEvent.setup>, date = "2026-10-12") {
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByRole("option", { name: "Dízimos" });
    const dateInput = screen.getByLabelText(/Data/) as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, date);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "c1");
  }

  it("preenche com o nome da categoria e o mês da data escolhida", async () => {
    const user = userEvent.setup();
    await openAndPick(user, "2026-10-12");
    expect(screen.getByLabelText(/Descrição/)).toHaveValue("Dízimos - Outubro");
  });

  it("acompanha a data e a categoria enquanto a pessoa não escreveu nada", async () => {
    const user = userEvent.setup();
    await openAndPick(user, "2026-10-12");

    const dateInput = screen.getByLabelText(/Data/) as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, "2026-03-05");
    expect(screen.getByLabelText(/Descrição/)).toHaveValue("Dízimos - Março");

    await user.selectOptions(screen.getAllByRole("combobox")[0], "c1a");
    expect(screen.getByLabelText(/Descrição/)).toHaveValue("Dízimo online - Março");
  });

  it("não sobrescreve o que a pessoa escreveu", async () => {
    const user = userEvent.setup();
    await openAndPick(user, "2026-10-12");

    const desc = screen.getByLabelText(/Descrição/);
    await user.clear(desc);
    await user.type(desc, "Oferta especial");

    const dateInput = screen.getByLabelText(/Data/) as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, "2026-11-02");
    await user.selectOptions(screen.getAllByRole("combobox")[0], "c1a");

    expect(desc).toHaveValue("Oferta especial");
  });

  it("apagar a descrição devolve a sugestão na próxima mudança", async () => {
    const user = userEvent.setup();
    await openAndPick(user, "2026-10-12");

    const desc = screen.getByLabelText(/Descrição/);
    await user.clear(desc);
    await user.type(desc, "Algo");
    await user.clear(desc);

    const dateInput = screen.getByLabelText(/Data/) as HTMLInputElement;
    await user.clear(dateInput);
    await user.type(dateInput, "2026-12-01");
    expect(desc).toHaveValue("Dízimos - Dezembro");
  });

  it("trocar para saída sem categoria esvazia a sugestão", async () => {
    const user = userEvent.setup();
    await openAndPick(user);
    await user.click(screen.getByRole("button", { name: "Saída" }));
    expect(screen.getByLabelText(/Descrição/)).toHaveValue("");
  });

  it("na edição, mantém a descrição existente ao trocar a categoria", async () => {
    const user = userEvent.setup();
    render(
      <NewTransactionModal
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        editTransaction={{
          id: "t1",
          type: "income",
          amount: 100,
          occurred_at: "2026-02-10T12:00:00Z",
          description: "Descrição antiga",
          category_id: "c1",
        }}
      />
    );
    await screen.findByRole("option", { name: "Dízimos" });
    await user.selectOptions(screen.getAllByRole("combobox")[0], "c1a");
    expect(screen.getByLabelText(/Descrição/)).toHaveValue("Descrição antiga");
  });
});

describe("NewTransactionModal — já pago no cadastro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet();
    vi.mocked(api.post).mockResolvedValue({ data: {} });
  });

  it("mostra a opção para quem pode marcar como pago e envia status paid", async () => {
    asRoles(["treasurer"]);
    const user = userEvent.setup();
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await fillRequiredFields(user);

    await user.click(screen.getByRole("checkbox", { name: /Já está pago/ }));
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        "/financial/transactions",
        expect.objectContaining({ status: "paid" })
      )
    );
    expect(await screen.findByText("Lançamento registrado como pago!")).toBeInTheDocument();
  });

  it("sem marcar, não manda status e o lançamento nasce pendente", async () => {
    asRoles(["tenant_admin"]);
    const user = userEvent.setup();
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Registrar" }));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0]![1]).not.toHaveProperty("status");
  });

  it("não mostra a opção ao secretário, que cria mas não baixa lançamento", async () => {
    asRoles(["secretary"]);
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByRole("option", { name: "Dízimos" });
    expect(screen.queryByRole("checkbox", { name: /Já está pago/ })).not.toBeInTheDocument();
  });

  it("some em lançamento parcelado ou fixo, que nascem pendentes", async () => {
    asRoles(["treasurer"]);
    const user = userEvent.setup();
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    await screen.findByRole("option", { name: "Dízimos" });
    expect(screen.getByRole("checkbox", { name: /Já está pago/ })).toBeInTheDocument();

    const kind = screen.getAllByRole("combobox").find((el) =>
      Array.from((el as HTMLSelectElement).options).some((o) => o.text === "Parcelado")
    )!;
    await user.selectOptions(kind, "installment");
    expect(screen.queryByRole("checkbox", { name: /Já está pago/ })).not.toBeInTheDocument();
  });

  it("não aparece ao editar", async () => {
    asRoles(["treasurer"]);
    render(
      <NewTransactionModal
        open={true}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
        editTransaction={{
          id: "t1",
          type: "income",
          amount: 100,
          occurred_at: "2026-02-10T12:00:00Z",
          description: "X",
          category_id: "c1",
        }}
      />
    );
    await screen.findByRole("option", { name: "Dízimos" });
    expect(screen.queryByRole("checkbox", { name: /Já está pago/ })).not.toBeInTheDocument();
  });
});
