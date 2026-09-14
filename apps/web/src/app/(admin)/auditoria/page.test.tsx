import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import AuditoriaPage from "./page";

vi.mock("@/lib/api", () => ({
  // Espelha o `isForbidden` real: 403 e só 403.
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn() },
}));

const mockedApi = vi.mocked(api, true);

function log(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "log-1",
    at: "2026-09-04T15:00:00.000Z",
    action: "support_access",
    entity: "/persons",
    congregation_id: "c1",
    actor_user_id: "support-1",
    actor_name: "Ana Suporte",
    route: "/persons",
    method: "GET",
    status: 200,
    ...overrides,
  };
}

function respondWith(data: unknown[], total = data.length) {
  mockedApi.get.mockResolvedValue({ data: { data, total, page: 1, limit: 20 } });
}

function lastUrl(): string {
  const calls = mockedApi.get.mock.calls;
  return calls[calls.length - 1]![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuditoriaPage", () => {
  it("lista o acesso do suporte com quem, quando e o quê", async () => {
    respondWith([log()]);

    render(<AuditoriaPage />);

    expect(await screen.findByText("Ana Suporte")).toBeInTheDocument();
    // Dentro da tabela: "Acesso do suporte" também é rótulo de uma opção do
    // filtro, e o `screen` inteiro acharia as duas.
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Acesso do suporte")).toBeInTheDocument();
    expect(screen.getByText(/GET \/persons/)).toBeInTheDocument();
    // Horário de Brasília: 15:00Z é 12:00 em São Paulo.
    expect(screen.getByText("04/09/2026, 12:00")).toBeInTheDocument();
  });

  it("a transferência de conta aparece pelo assunto, sem rota", async () => {
    respondWith([
      log({
        id: "log-2",
        action: "tenant_transfer",
        entity: "user_account",
        route: null,
        method: null,
        status: null,
      }),
    ]);

    render(<AuditoriaPage />);

    expect(await screen.findByText("Conta de usuário transferida")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("Transferência de conta")).toBeInTheDocument();
  });

  it("autor sem snapshot vira `Conta removida`, não vazio", async () => {
    respondWith([log({ actor_name: null })]);

    render(<AuditoriaPage />);

    expect(await screen.findByText("Conta removida")).toBeInTheDocument();
  });

  it("403 é `sem acesso`, não lista vazia", async () => {
    mockedApi.get.mockRejectedValue({ response: { status: 403 } });

    render(<AuditoriaPage />);

    expect(
      await screen.findByText(/Você não tem acesso a Auditoria/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum acesso registrado/)).not.toBeInTheDocument();
  });

  it("falha que não é 403 é erro de carga, não ausência de registro", async () => {
    mockedApi.get.mockRejectedValue({ response: { status: 500 } });

    render(<AuditoriaPage />);

    expect(
      await screen.findByText("Não foi possível carregar a auditoria.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nenhum acesso registrado/)).not.toBeInTheDocument();
  });

  it("lista vazia sem filtro diz que nada foi registrado", async () => {
    respondWith([]);

    render(<AuditoriaPage />);

    expect(await screen.findByText(/Nenhum acesso registrado até agora/)).toBeInTheDocument();
  });

  it("o filtro de ação vai para a query e volta a página para 1", async () => {
    respondWith([log()], 40);
    const user = userEvent.setup();

    render(<AuditoriaPage />);
    await screen.findByText("Ana Suporte");

    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    await waitFor(() => expect(lastUrl()).toContain("page=2"));

    await user.selectOptions(screen.getByLabelText("Filtrar por ação"), "tenant_transfer");

    await waitFor(() => {
      expect(lastUrl()).toContain("action=tenant_transfer");
      expect(lastUrl()).toContain("page=1");
    });
  });

  it("as datas viram `from`/`to` na query, e o limpar remove as três", async () => {
    respondWith([log()]);
    const user = userEvent.setup();

    render(<AuditoriaPage />);
    await screen.findByText("Ana Suporte");

    await user.type(screen.getByLabelText("Data inicial"), "2026-09-01");
    await user.type(screen.getByLabelText("Data final"), "2026-09-14");

    await waitFor(() => {
      expect(lastUrl()).toContain("from=2026-09-01");
      expect(lastUrl()).toContain("to=2026-09-14");
    });

    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));

    await waitFor(() => {
      expect(lastUrl()).not.toContain("from=");
      expect(lastUrl()).not.toContain("to=");
      expect(lastUrl()).not.toContain("action=");
    });
  });

  it("filtro sem resultado não se confunde com ausência de registro", async () => {
    respondWith([log()]);
    const user = userEvent.setup();

    render(<AuditoriaPage />);
    await screen.findByText("Ana Suporte");

    respondWith([]);
    await user.selectOptions(screen.getByLabelText("Filtrar por ação"), "tenant_transfer");

    expect(await screen.findByText(/Nenhum registro com esses filtros/)).toBeInTheDocument();
  });

  it("sem paginação quando tudo cabe numa página", async () => {
    respondWith([log()], 1);

    render(<AuditoriaPage />);
    await screen.findByText("Ana Suporte");

    expect(screen.queryByRole("button", { name: "Próxima página" })).not.toBeInTheDocument();
  });
});
