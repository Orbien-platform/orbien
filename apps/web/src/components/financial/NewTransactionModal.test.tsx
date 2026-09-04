import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NewTransactionModal } from "./NewTransactionModal";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
}));

const categories = [
  {
    id: "c1",
    name: "Dízimos",
    type: "income" as const,
    children: [{ id: "c1a", name: "Dízimo online", type: "income" as const, children: [] }],
  },
  { id: "c2", name: "Aluguel", type: "expense" as const, children: [] },
];

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getAllByRole("combobox")[0], "c1");
  await user.type(screen.getByLabelText(/Valor/), "1000");
  await user.type(screen.getByLabelText(/Descrição/), "Dízimos do culto");
}

describe("NewTransactionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: categories });
  });

  it("does not render form fields when closed", () => {
    render(<NewTransactionModal open={false} onOpenChange={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.queryByText("Novo lançamento")).not.toBeInTheDocument();
  });

  it("loads categories filtered by type and validates required fields", async () => {
    const user = userEvent.setup();
    render(<NewTransactionModal open={true} onOpenChange={vi.fn()} onCreated={vi.fn()} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/categories"));
    expect(screen.getAllByText("Dízimos").length).toBeGreaterThan(0);
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
