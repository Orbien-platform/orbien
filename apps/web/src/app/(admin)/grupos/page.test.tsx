import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import GruposPage from "./page";

vi.mock("@/lib/api", () => ({
  // Espelha o `isForbidden` real: 403 e só 403.
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

vi.mock("@/components/groups/GroupDetailSheet", () => ({
  GroupDetailSheet: ({
    open,
    groupId,
    onUpdated,
  }: {
    open: boolean;
    groupId: string | null;
    onUpdated: () => void;
  }) =>
    open ? (
      <div data-testid="group-detail-sheet">
        sheet:{groupId}
        <button onClick={onUpdated}>simular atualização</button>
      </div>
    ) : null,
}));
vi.mock("@/components/groups/CreateGroupModal", () => ({
  CreateGroupModal: ({ open, onCreated }: { open: boolean; onCreated: () => void }) =>
    open ? (
      <div data-testid="create-group-modal">
        <button onClick={onCreated}>simular criação</button>
      </div>
    ) : null,
}));
vi.mock("@/components/groups/GroupTypesModal", () => ({
  GroupTypesModal: ({ open, onChanged }: { open: boolean; onChanged: () => void }) =>
    open ? (
      <div data-testid="group-types-modal">
        <button onClick={onChanged}>simular mudança de tipos</button>
      </div>
    ) : null,
}));

const mockedApi = vi.mocked(api, true);
const mockedUseAuth = vi.mocked(useAuth);

function setup(roles: string[] = ["admin_congregation"]) {
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
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function mockApi(opts: {
  groups?: { data: unknown[]; total: number };
  types?: unknown[];
  groupsError?: boolean;
  typesError?: boolean;
}) {
  mockedApi.get.mockImplementation((url: string) => {
    if (url.startsWith("/small-groups")) {
      return opts.groupsError
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: { data: [], total: 0, page: 1, limit: 20, ...opts.groups } });
    }
    if (url.startsWith("/groups/types")) {
      return opts.typesError
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: opts.types ?? [] });
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GruposPage", () => {
  it("carrega e mostra a lista de grupos", async () => {
    setup();
    mockApi({
      groups: {
        data: [
          {
            id: "1",
            name: "Grupo Jovens",
            groupType: { id: "gt1", name: "Jovens", color: "#111" },
            meeting_time: "Sextas 20h",
            leader: { id: "l1", full_name: "Líder Um" },
            _count: { memberships: 12 },
          },
        ],
        total: 1,
      },
      types: [{ id: "gt1", name: "Jovens", color: "#111", is_active: true }],
    });
    render(<GruposPage />);
    expect(await screen.findByText("Grupo Jovens")).toBeInTheDocument();
    expect(screen.getByText("Líder Um")).toBeInTheDocument();
    expect(screen.getByText("Sextas 20h")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("1 grupo")).toBeInTheDocument();
  });

  it("mostra travessões quando tipo, líder, horário e membros faltam", async () => {
    setup();
    mockApi({
      groups: {
        data: [{ id: "1", name: "Grupo Sem Dados", groupType: undefined as never }],
        total: 1,
      },
    });
    render(<GruposPage />);
    await screen.findByText("Grupo Sem Dados");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("trata falha ao carregar grupos e tipos", async () => {
    setup();
    mockApi({ groupsError: true, typesError: true });
    render(<GruposPage />);
    expect(await screen.findByText("Nenhum grupo encontrado.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum grupo")).toBeInTheDocument();
  });

  it("busca e filtro de tipo disparam novas requisições, resetando a página", async () => {
    setup();
    mockApi({ types: [{ id: "gt1", name: "Jovens", color: null, is_active: true }] });
    const user = userEvent.setup();
    render(<GruposPage />);
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenCalledWith(expect.stringContaining("/small-groups?page=1"))
    );

    await user.type(screen.getByPlaceholderText("Buscar grupos…"), "jov");
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("search=jov"))
    );

    await user.selectOptions(screen.getByDisplayValue("Todos os tipos"), "gt1");
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("group_type_id=gt1"))
    );
  });

  it("pagina a lista de grupos", async () => {
    setup();
    mockApi({ groups: { data: [{ id: "1", name: "G1" }], total: 45 } });
    const user = userEvent.setup();
    render(<GruposPage />);
    await screen.findByText("G1");
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("page=2"))
    );
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await waitFor(() =>
      expect(mockedApi.get).toHaveBeenLastCalledWith(expect.stringContaining("page=1"))
    );
  });

  it("abre o sheet de detalhe ao clicar na linha e recarrega quando ele atualiza", async () => {
    setup();
    mockApi({ groups: { data: [{ id: "9", name: "Clique Aqui" }], total: 1 } });
    const user = userEvent.setup();
    render(<GruposPage />);
    await user.click(await screen.findByText("Clique Aqui"));
    expect(await screen.findByTestId("group-detail-sheet")).toHaveTextContent("sheet:9");

    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular atualização" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("mostra e usa os botões de admin (novo grupo, tipos de grupo)", async () => {
    setup(["tenant_admin"]);
    mockApi({});
    const user = userEvent.setup();
    render(<GruposPage />);
    await screen.findByText("Nenhum grupo encontrado.");

    await user.click(screen.getByRole("button", { name: "Novo grupo" }));
    expect(screen.getByTestId("create-group-modal")).toBeInTheDocument();
    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));

    await user.click(screen.getByRole("button", { name: "Tipos de grupo" }));
    expect(screen.getByTestId("group-types-modal")).toBeInTheDocument();
    const callsBeforeTypes = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular mudança de tipos" }));
    await waitFor(() =>
      expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBeforeTypes)
    );
  });

  it("esconde os botões de admin para quem não tem papel de gestão", async () => {
    setup(["member"]);
    mockApi({});
    render(<GruposPage />);
    await screen.findByText("Nenhum grupo encontrado.");
    expect(screen.queryByRole("button", { name: "Novo grupo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tipos de grupo" })).not.toBeInTheDocument();
  });

  it("trata usuário sem roles como sem permissão nenhuma (fallback ?? [])", async () => {
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
        expires_at: Math.floor(Date.now() / 1000) + 300,
      },
      isLoading: false,
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
    });
    mockApi({});
    render(<GruposPage />);
    await screen.findByText("Nenhum grupo encontrado.");
    expect(screen.queryByRole("button", { name: "Novo grupo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tipos de grupo" })).not.toBeInTheDocument();
  });

  it("403 em /small-groups diz \"sem acesso\", não \"nenhum grupo\"", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/small-groups")) return Promise.reject({ response: { status: 403 } });
      return Promise.resolve({ data: [] });
    });
    render(<GruposPage />);

    expect(await screen.findByText("Você não tem acesso a Grupos.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum grupo encontrado.")).not.toBeInTheDocument();
  });

  it("usa os valores default quando a resposta de /small-groups não traz data/total", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/small-groups")) return Promise.resolve({ data: {} });
      return Promise.resolve({ data: [] });
    });
    render(<GruposPage />);
    expect(await screen.findByText("Nenhum grupo encontrado.")).toBeInTheDocument();
    expect(screen.getByText("Nenhum grupo")).toBeInTheDocument();
  });

  it("ignora resposta e falha de uma requisição de grupos cancelada por filtro mais recente", async () => {
    setup();
    let resolveFirst!: (v: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    let callCount = 0;
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/groups/types")) return Promise.resolve({ data: [] });
      callCount += 1;
      if (callCount === 1) return first as never;
      return Promise.resolve({
        data: { data: [{ id: "2", name: "Segunda Busca" }], total: 1, page: 1, limit: 20 },
      });
    });
    const user = userEvent.setup();
    render(<GruposPage />);
    await waitFor(() => expect(callCount).toBe(1));

    await user.type(screen.getByPlaceholderText("Buscar grupos…"), "x");
    await waitFor(() => expect(callCount).toBe(2));
    await screen.findByText("Segunda Busca");

    resolveFirst({ data: { data: [{ id: "1", name: "Resposta Antiga" }], total: 1 } });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("Resposta Antiga")).not.toBeInTheDocument();
    expect(screen.getByText("Segunda Busca")).toBeInTheDocument();
  });

  it("ignora falha de uma requisição de grupos cancelada por filtro mais recente", async () => {
    setup();
    let rejectFirst!: (e: unknown) => void;
    const first = new Promise((_resolve, reject) => { rejectFirst = reject; });
    first.catch(() => {});
    let callCount = 0;
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/groups/types")) return Promise.resolve({ data: [] });
      callCount += 1;
      if (callCount === 1) return first as never;
      return Promise.resolve({
        data: { data: [{ id: "2", name: "Segunda Busca" }], total: 1, page: 1, limit: 20 },
      });
    });
    const user = userEvent.setup();
    render(<GruposPage />);
    await waitFor(() => expect(callCount).toBe(1));

    await user.type(screen.getByPlaceholderText("Buscar grupos…"), "x");
    await waitFor(() => expect(callCount).toBe(2));
    await screen.findByText("Segunda Busca");

    rejectFirst(new Error("tarde demais"));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText("Segunda Busca")).toBeInTheDocument();
  });

  it("permite pastor editar grupos mas não gerenciar tipos", async () => {
    setup(["pastor"]);
    mockApi({});
    render(<GruposPage />);
    await screen.findByText("Nenhum grupo encontrado.");
    expect(screen.getByRole("button", { name: "Novo grupo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tipos de grupo" })).not.toBeInTheDocument();
  });
});
