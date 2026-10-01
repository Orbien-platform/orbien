import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PixSubscriptionsPanel } from "./PixSubscriptionsPanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

function sub(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    amount: "200.00",
    description: null,
    status: "active",
    created_at: "2026-09-01T12:00:00Z",
    cancelled_at: null,
    donorPerson: { full_name: "Maria Souza" },
    ...overrides,
  };
}

function mockGets(subs: unknown[]) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.startsWith("/persons")) {
      return Promise.resolve({ data: { data: [{ id: "p1", full_name: "João Lima" }] } });
    }
    return Promise.resolve({ data: subs });
  });
}

describe("PixSubscriptionsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista assinaturas com doador, valor e situação — uma carga só em StrictMode", async () => {
    mockGets([sub(), sub({ id: "s2", status: "cancelled", donorPerson: { full_name: "Ana" } })]);
    render(
      <StrictMode>
        <PixSubscriptionsPanel />
      </StrictMode>,
    );

    expect(await screen.findByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s?200,00/)).toHaveLength(2);
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.getByText("Cancelada")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
    // só a ativa tem botão de cancelar
    expect(screen.getAllByRole("button", { name: /Cancelar assinatura de/ })).toHaveLength(1);
  });

  it("mostra o estado vazio com a orientação", async () => {
    mockGets([]);
    render(<PixSubscriptionsPanel />);
    expect(await screen.findByText(/Nenhuma assinatura ainda/)).toBeInTheDocument();
  });

  it("cria a assinatura para a pessoa escolhida e recarrega a lista", async () => {
    mockGets([]);
    vi.mocked(api.post).mockResolvedValue({ data: { id: "s9" } });
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    await screen.findByText(/Nenhuma assinatura ainda/);

    await user.click(screen.getByRole("button", { name: "Nova assinatura" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Buscar pessoa pelo nome"), "Joa");
    await user.click(await within(dialog).findByRole("button", { name: "João Lima" }));
    await user.type(within(dialog).getByLabelText("Valor mensal"), "10000");
    await user.click(within(dialog).getByRole("button", { name: "Criar assinatura" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/financial/pix/subscriptions", {
        donor_person_id: "p1",
        amount: 100,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(vi.mocked(api.get).mock.calls.filter((c) => c[0] === "/financial/pix/subscriptions")).toHaveLength(2);
  });

  it("exige doador e valor antes de chamar a API", async () => {
    mockGets([]);
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    await screen.findByText(/Nenhuma assinatura ainda/);
    await user.click(screen.getByRole("button", { name: "Nova assinatura" }));
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "Criar assinatura" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Escolha o doador.");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("mostra a mensagem da API quando a criação é recusada (4xx)", async () => {
    mockGets([]);
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: "Igreja não configurou chave PIX" } },
    });
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    await screen.findByText(/Nenhuma assinatura ainda/);
    await user.click(screen.getByRole("button", { name: "Nova assinatura" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Buscar pessoa pelo nome"), "Joa");
    await user.click(await within(dialog).findByRole("button", { name: "João Lima" }));
    await user.type(within(dialog).getByLabelText("Valor mensal"), "10000");
    await user.click(within(dialog).getByRole("button", { name: "Criar assinatura" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Igreja não configurou chave PIX");
  });

  it("cancelar pede confirmação explícita e só chama a API depois dela", async () => {
    mockGets([sub()]);
    vi.mocked(api.patch).mockResolvedValue({ data: sub({ status: "cancelled" }) });
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);

    await user.click(await screen.findByRole("button", { name: "Cancelar assinatura de Maria Souza" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/cancelada na Asaas/)).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Cancelar assinatura" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/financial/pix/subscriptions/s1/cancel"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("Manter assinatura fecha o diálogo sem chamar a API", async () => {
    mockGets([sub()]);
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    await user.click(await screen.findByRole("button", { name: "Cancelar assinatura de Maria Souza" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Manter assinatura" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("se a Asaas falhar, avisa que a assinatura continua ativa e mantém o diálogo", async () => {
    mockGets([sub()]);
    vi.mocked(api.patch).mockRejectedValue({ isAxiosError: true, response: { status: 503, data: {} } });
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    await user.click(await screen.findByRole("button", { name: "Cancelar assinatura de Maria Souza" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancelar assinatura" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("A assinatura continua ativa");
  });

  it("mostra sem acesso no 403", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<PixSubscriptionsPanel />);
    expect(await screen.findByText(/Você não tem acesso a PIX recorrente/)).toBeInTheDocument();
  });

  it("mostra erro de carga", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("x"));
    render(<PixSubscriptionsPanel />);
    expect(await screen.findByText("Erro ao carregar as assinaturas.")).toBeInTheDocument();
  });

  async function openCreateWithDonor(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByText(/Nenhuma assinatura ainda/);
    await user.click(screen.getByRole("button", { name: "Nova assinatura" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText("Buscar pessoa pelo nome"), "Joa");
    await user.click(await within(dialog).findByRole("button", { name: "João Lima" }));
    return dialog;
  }

  it("exige valor maior que zero quando o doador já foi escolhido", async () => {
    mockGets([]);
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    const dialog = await openCreateWithDonor(user);

    await user.click(within(dialog).getByRole("button", { name: "Criar assinatura" }));

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Informe um valor maior que zero.");
    expect(api.post).not.toHaveBeenCalled();
  });

  it("envia a descrição quando preenchida", async () => {
    mockGets([]);
    vi.mocked(api.post).mockResolvedValue({ data: { id: "s9" } });
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    const dialog = await openCreateWithDonor(user);
    await user.type(within(dialog).getByLabelText("Valor mensal"), "10000");
    await user.type(within(dialog).getByLabelText("Descrição (opcional)"), " Dízimo de outubro ");
    await user.click(within(dialog).getByRole("button", { name: "Criar assinatura" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/financial/pix/subscriptions", {
        donor_person_id: "p1",
        amount: 100,
        description: "Dízimo de outubro",
      }),
    );
  });

  it("Voltar e Escape fecham o diálogo de criação sem criar nada", async () => {
    mockGets([]);
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    await screen.findByText(/Nenhuma assinatura ainda/);

    await user.click(screen.getByRole("button", { name: "Nova assinatura" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Nova assinatura" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
  });

  it("Escape fecha o diálogo de cancelamento sem chamar a API", async () => {
    mockGets([sub()]);
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    await user.click(await screen.findByRole("button", { name: "Cancelar assinatura de Maria Souza" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("mostra a descrição da assinatura e lida com doador sem nome", async () => {
    mockGets([sub({ description: "Dízimo", donorPerson: null })]);
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);

    expect(await screen.findByText("Dízimo")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar assinatura de doador" }));
    expect(within(await screen.findByRole("dialog")).getByText(/Cancelar a assinatura de este doador\?/)).toBeInTheDocument();
  });

  it("usa a primeira mensagem quando a validação da API devolve uma lista", async () => {
    mockGets([]);
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { status: 400, data: { message: ["amount must be a positive number", "outra"] } },
    });
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    const dialog = await openCreateWithDonor(user);
    await user.type(within(dialog).getByLabelText("Valor mensal"), "10000");
    await user.click(within(dialog).getByRole("button", { name: "Criar assinatura" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("amount must be a positive number");
  });

  it("cai no texto genérico quando o 4xx não traz mensagem legível", async () => {
    mockGets([]);
    vi.mocked(api.post).mockRejectedValue({ isAxiosError: true, response: { status: 404, data: { message: 42 } } });
    const user = userEvent.setup();
    render(<PixSubscriptionsPanel />);
    const dialog = await openCreateWithDonor(user);
    await user.type(within(dialog).getByLabelText("Valor mensal"), "10000");
    await user.click(within(dialog).getByRole("button", { name: "Criar assinatura" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Não foi possível criar a assinatura");
  });
});
