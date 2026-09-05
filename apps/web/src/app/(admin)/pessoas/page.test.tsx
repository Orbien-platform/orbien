import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import PessoasPage from "./page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// Sheet e modais são de domínio (Fase 9, fora de escopo) — aqui só importa que
// a página os abre com os props certos.
vi.mock("@/components/persons/PersonSheet", () => ({
  PersonSheet: ({
    open,
    personId,
    onUpdated,
  }: {
    open: boolean;
    personId: string | null;
    onUpdated: () => void;
  }) =>
    open ? (
      <div data-testid="person-sheet">
        sheet:{personId}
        <button onClick={onUpdated}>simular atualização</button>
      </div>
    ) : null,
}));
vi.mock("@/components/persons/CreateVisitorModal", () => ({
  CreateVisitorModal: ({ open, onCreated }: { open: boolean; onCreated: () => void }) =>
    open ? (
      <div data-testid="create-visitor-modal">
        <button onClick={onCreated}>simular criação</button>
      </div>
    ) : null,
}));
vi.mock("@/components/persons/ImportCsvModal", () => ({
  ImportCsvModal: ({ open, onImported }: { open: boolean; onImported: () => void }) =>
    open ? (
      <div data-testid="import-csv-modal">
        <button onClick={onImported}>simular importação</button>
      </div>
    ) : null,
}));
vi.mock("@/components/persons/ImportHelpModal", () => ({
  ImportHelpModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="import-help-modal" /> : null,
}));

const mockedApi = vi.mocked(api, true);
const mockedUseAuth = vi.mocked(useAuth);

function setup(roles: string[] = ["tenant_admin"]) {
  mockedUseAuth.mockReturnValue({
    user: {
      id: "u1",
      name: "Ana",
      email: "ana@a.com",
      roles,
      tenant_id: "t1",
      congregation_id: "c1",
      support_session: false,
      support_tenant_name: null,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function page(overrides: Partial<{ data: unknown[]; total: number }> = {}) {
  return { data: overrides.data ?? [], total: overrides.total ?? (overrides.data?.length ?? 0), page: 1, limit: 20 };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PessoasPage", () => {
  it("carrega e mostra a lista de pessoas", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: page({
        data: [
          { id: "1", full_name: "Ana Silva", phone: "11987654321", email: "a@a.com", classification: "member", created_at: "2026-01-05T00:00:00Z" },
        ],
        total: 1,
      }),
    });
    render(<PessoasPage />);

    expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(screen.getByText("Membro")).toBeInTheDocument();
    expect(screen.getByText("05/01/2026")).toBeInTheDocument();
    expect(mockedApi.get).toHaveBeenCalledWith(expect.stringContaining("/persons?page=1&limit=20"));
  });

  it("mostra telefone de 10 dígitos formatado e — quando ausente", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: page({
        data: [
          { id: "1", full_name: "Sem Fone", classification: "visitor", created_at: "2026-01-05T00:00:00Z" },
          { id: "2", full_name: "Fone Fixo", phone: "1122223333", classification: "visitor", created_at: "2026-01-05T00:00:00Z" },
          { id: "3", full_name: "Fone Estranho", phone: "123", classification: "visitor", created_at: "2026-01-05T00:00:00Z" },
        ],
        total: 3,
      }),
    });
    render(<PessoasPage />);
    await screen.findByText("Sem Fone");
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("(11) 2222-3333")).toBeInTheDocument();
    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("mostra estado vazio sem filtros e com filtros", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: page() });
    const user = userEvent.setup();
    render(<PessoasPage />);
    expect(await screen.findByText("Nenhuma pessoa cadastrada ainda.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Buscar por nome…"), "xyz");
    await waitFor(() =>
      expect(screen.getByText("Nenhuma pessoa encontrada com esses filtros.")).toBeInTheDocument()
    );
  });

  it("trata falha da API mostrando lista vazia", async () => {
    setup();
    mockedApi.get.mockRejectedValue(new Error("boom"));
    render(<PessoasPage />);
    expect(await screen.findByText("Nenhuma pessoa cadastrada ainda.")).toBeInTheDocument();
  });

  it("busca dispara nova requisição com o parâmetro search", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: page() });
    const user = userEvent.setup();
    render(<PessoasPage />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(1));

    await user.type(screen.getByPlaceholderText("Buscar por nome…"), "ana");
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("search=ana"))
    );
  });

  it("filtro de classificação dispara nova requisição", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: page() });
    const user = userEvent.setup();
    render(<PessoasPage />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(1));

    await user.selectOptions(screen.getByDisplayValue("Todas as classificações"), "member");
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("classification=member"))
    );
  });

  it("mostra paginação quando total excede o limite e navega entre páginas", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: page({
        data: Array.from({ length: 20 }, (_, i) => ({
          id: String(i),
          full_name: `Pessoa ${i}`,
          classification: "member",
          created_at: "2026-01-05T00:00:00Z",
        })),
        total: 45,
      }),
    });
    const user = userEvent.setup();
    render(<PessoasPage />);
    await screen.findByText("Pessoa 0");
    expect(screen.getByText("1–20 de 45")).toBeInTheDocument();

    const nextBtn = screen.getByRole("button", { name: "Próxima página" });
    expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();
    await user.click(nextBtn);
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("page=2"))
    );

    // O botão some enquanto `isLoading` fica true entre o clique e o
    // próximo render — `findByRole` espera reaparecer, `getByRole` pega a
    // janela de corrida e falha de forma intermitente.
    await user.click(await screen.findByRole("button", { name: "Página anterior" }));
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("page=1"))
    );
  });

  it("abre o sheet de pessoa ao clicar na linha", async () => {
    setup();
    mockedApi.get.mockResolvedValue({
      data: page({ data: [{ id: "42", full_name: "Clique Aqui", classification: "member", created_at: "2026-01-05T00:00:00Z" }], total: 1 }),
    });
    const user = userEvent.setup();
    render(<PessoasPage />);
    await user.click(await screen.findByText("Clique Aqui"));
    expect(await screen.findByTestId("person-sheet")).toHaveTextContent("sheet:42");

    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular atualização" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("abre os modais de criação, importação e ajuda, e recarrega quando eles concluem", async () => {
    setup(["tenant_admin"]);
    mockedApi.get.mockResolvedValue({ data: page() });
    const user = userEvent.setup();
    render(<PessoasPage />);
    await screen.findByText("Nenhuma pessoa cadastrada ainda.");
    const callsAfterMount = mockedApi.get.mock.calls.length;

    await user.click(screen.getByRole("button", { name: /cadastrar visitante/i }));
    expect(screen.getByTestId("create-visitor-modal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await waitFor(() =>
      expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsAfterMount)
    );

    await user.click(screen.getByRole("button", { name: /importar csv/i }));
    expect(screen.getByTestId("import-csv-modal")).toBeInTheDocument();
    const callsBeforeImport = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular importação" }));
    await waitFor(() =>
      expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBeforeImport)
    );

    await user.click(screen.getByRole("button", { name: /como importar/i }));
    expect(screen.getByTestId("import-help-modal")).toBeInTheDocument();
  });

  it("esconde ações de importação para o papel pastor", async () => {
    setup(["pastor"]);
    mockedApi.get.mockResolvedValue({ data: page() });
    render(<PessoasPage />);
    await screen.findByText("Nenhuma pessoa cadastrada ainda.");
    expect(screen.queryByRole("button", { name: /importar csv/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /como importar/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cadastrar visitante/i })).toBeInTheDocument();
  });

  it("não mostra o contador de total quando ele é zero", async () => {
    setup();
    mockedApi.get.mockResolvedValue({ data: page() });
    render(<PessoasPage />);
    await screen.findByText("Nenhuma pessoa cadastrada ainda.");
    expect(screen.queryByText(/\d+ pessoas? cadastradas?/i)).not.toBeInTheDocument();
  });

  it("trata usuário sem roles como não-pastor (fallback ?? false)", async () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "u1",
        name: "Ana",
        email: "ana@a.com",
        roles: undefined as unknown as string[],
        tenant_id: "t1",
        congregation_id: "c1",
        support_session: false,
        support_tenant_name: null,
      },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockedApi.get.mockResolvedValue({ data: page() });
    render(<PessoasPage />);
    await screen.findByText("Nenhuma pessoa cadastrada ainda.");
    // Sem papel "pastor" identificável, os botões de importação aparecem.
    expect(screen.getByRole("button", { name: /importar csv/i })).toBeInTheDocument();
  });

  it("ignora a resposta de uma requisição cancelada por uma busca mais recente", async () => {
    setup();
    let resolveFirst!: (v: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    mockedApi.get.mockReturnValueOnce(first as never);
    mockedApi.get.mockResolvedValueOnce({
      data: page({ data: [{ id: "2", full_name: "Segunda Busca", classification: "member", created_at: "2026-01-05T00:00:00Z" }], total: 1 }),
    });

    const user = userEvent.setup();
    render(<PessoasPage />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(1));

    // Dispara uma segunda busca antes da primeira responder — o cleanup do
    // effect anterior marca `signal.cancelled = true`.
    await user.type(screen.getByPlaceholderText("Buscar por nome…"), "ana");
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(2));
    await screen.findByText("Segunda Busca");

    // A primeira promise resolve tarde — não deve sobrescrever o resultado.
    resolveFirst({
      data: page({ data: [{ id: "1", full_name: "Resposta Antiga", classification: "member", created_at: "2026-01-05T00:00:00Z" }], total: 1 }),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("Resposta Antiga")).not.toBeInTheDocument();
    expect(screen.getByText("Segunda Busca")).toBeInTheDocument();
  });

  it("ignora falha de uma requisição cancelada por uma busca mais recente", async () => {
    setup();
    let rejectFirst!: (e: unknown) => void;
    const first = new Promise((_resolve, reject) => { rejectFirst = reject; });
    first.catch(() => {});
    mockedApi.get.mockReturnValueOnce(first as never);
    mockedApi.get.mockResolvedValueOnce({
      data: page({ data: [{ id: "2", full_name: "Segunda Busca", classification: "member", created_at: "2026-01-05T00:00:00Z" }], total: 1 }),
    });

    const user = userEvent.setup();
    render(<PessoasPage />);
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(1));

    await user.type(screen.getByPlaceholderText("Buscar por nome…"), "ana");
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalledTimes(2));
    await screen.findByText("Segunda Busca");

    rejectFirst(new Error("tarde demais"));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("Segunda Busca")).toBeInTheDocument();
  });
});
