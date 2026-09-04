import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GruposPage from "./page";
import api from "@/lib/api";
import { fetchGroupTypes } from "@/lib/groupTypes";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/groupTypes", async () => {
  const real = await vi.importActual<typeof import("@/lib/groupTypes")>(
    "@/lib/groupTypes"
  );
  return { ...real, fetchGroupTypes: vi.fn() };
});

// Debounce de 300ms com `onSearch("")` na montagem reiniciaria a página no
// meio da navegação. O componente real tem spec própria (Fase 8).
vi.mock("@/components/ui/SearchInput", () => ({
  SearchInput: ({
    placeholder,
    onSearch,
  }: {
    placeholder?: string;
    onSearch: (v: string) => void;
  }) => (
    <input
      type="search"
      placeholder={placeholder}
      onChange={(e) => onSearch(e.target.value)}
    />
  ),
}));

vi.mock("@/components/groups/GroupDetailSheet", () => ({
  GroupDetailSheet: ({
    open,
    groupId,
    canEdit,
    onUpdated,
  }: {
    open: boolean;
    groupId: string | null;
    canEdit: boolean;
    onUpdated: () => void;
  }) => (
    <div>
      <span>sheet:{open ? groupId : "fechada"}</span>
      <span>sheet-canEdit:{String(canEdit)}</span>
      <button onClick={onUpdated}>avisar edição de grupo</button>
    </div>
  ),
}));
vi.mock("@/components/groups/CreateGroupModal", () => ({
  CreateGroupModal: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: () => void;
  }) => (
    <div>
      <span>criar:{open ? "aberto" : "fechado"}</span>
      <button onClick={onCreated}>avisar criação</button>
    </div>
  ),
}));
vi.mock("@/components/groups/GroupTypesModal", () => ({
  GroupTypesModal: ({
    open,
    onChanged,
  }: {
    open: boolean;
    onChanged: () => void;
  }) => (
    <div>
      <span>tipos:{open ? "aberto" : "fechado"}</span>
      <button onClick={onChanged}>avisar mudança de tipos</button>
    </div>
  ),
}));

const getMock = vi.mocked(api.get);
const fetchGroupTypesMock = vi.mocked(fetchGroupTypes);

function grupo(overrides: Record<string, unknown> = {}) {
  return {
    id: "g-1",
    name: "Célula Centro",
    groupType: { id: "t-1", name: "Célula", color: "#123456" },
    meeting_time: "Quarta 20h",
    leader: { id: "p-1", full_name: "Ana Silva" },
    _count: { memberships: 12 },
    ...overrides,
  };
}

function respondeCom(data: unknown[], total = data.length) {
  getMock.mockResolvedValue({
    data: { data, total, page: 1, limit: 20 },
  } as never);
}

function comPapeis(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "u-1",
      name: "ana",
      email: "ana@igreja.com",
      roles,
      tenant_id: "t-1",
      congregation_id: "c-1",
      support_session: false,
      support_tenant_name: null,
    },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

function ultimaUrl() {
  return getMock.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  getMock.mockReset();
  respondeCom([grupo()], 1);
  fetchGroupTypesMock.mockReset().mockResolvedValue([
    { id: "t-1", name: "Célula", color: "#123456", is_active: true },
    { id: "t-2", name: "Discipulado", color: null, is_active: true },
  ]);
  comPapeis(["tenant_admin"]);
});

describe("GruposPage", () => {
  it("lista os grupos com tipo, líder, horário e contagem de membros", async () => {
    render(<GruposPage />);

    expect(await screen.findByText("Célula Centro")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/small-groups?page=1&limit=20");
    // "Célula" também é opção do filtro; a asserção é sobre a linha.
    expect(
      within(screen.getByRole("table")).getByText("Célula")
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    expect(screen.getByText("Quarta 20h")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("1 grupo")).toBeInTheDocument();
  });

  it("pluraliza a contagem e mostra 'Nenhum grupo' quando vazio", async () => {
    respondeCom([grupo(), grupo({ id: "g-2", name: "Célula Sul" })], 2);
    const { unmount } = render(<GruposPage />);
    expect(await screen.findByText("2 grupos")).toBeInTheDocument();
    unmount();

    respondeCom([], 0);
    render(<GruposPage />);
    expect(await screen.findByText("Nenhum grupo")).toBeInTheDocument();
    expect(screen.getByText("Nenhum grupo encontrado.")).toBeInTheDocument();
  });

  it("cai no traço e na cor padrão quando o grupo vem incompleto", async () => {
    respondeCom([
      {
        id: "g-9",
        name: "Grupo cru",
        groupType: null,
        meeting_time: undefined,
        leader: undefined,
        _count: undefined,
      },
    ]);

    render(<GruposPage />);

    await screen.findByText("Grupo cru");
    // Tipo, líder, horário e membros ausentes: quatro traços.
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("resposta sem `data`/`total` não quebra a tabela", async () => {
    getMock.mockResolvedValue({ data: {} } as never);

    render(<GruposPage />);

    expect(
      await screen.findByText("Nenhum grupo encontrado.")
    ).toBeInTheDocument();
    expect(screen.getByText("Nenhum grupo")).toBeInTheDocument();
  });

  it("erro da API zera a lista", async () => {
    getMock.mockRejectedValue(new Error("500"));

    render(<GruposPage />);

    expect(
      await screen.findByText("Nenhum grupo encontrado.")
    ).toBeInTheDocument();
  });

  it("busca e filtro de tipo viram parâmetros da consulta", async () => {
    const user = userEvent.setup();
    render(<GruposPage />);
    await screen.findByText("Célula Centro");

    await user.type(screen.getByPlaceholderText("Buscar grupos…"), "centro");
    await waitFor(() => expect(ultimaUrl()).toContain("search=centro"));

    await user.selectOptions(screen.getByRole("combobox"), "t-2");
    await waitFor(() => expect(ultimaUrl()).toContain("group_type_id=t-2"));
    expect(ultimaUrl()).toContain("page=1");
  });

  it("preenche o filtro com os tipos vindos da API", async () => {
    render(<GruposPage />);

    expect(
      await screen.findByRole("option", { name: "Discipulado" })
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Todos os tipos" })).toBeInTheDocument();
  });

  it("falha ao carregar tipos deixa só a opção padrão", async () => {
    fetchGroupTypesMock.mockRejectedValue(new Error("500"));

    render(<GruposPage />);

    await screen.findByText("Célula Centro");
    await waitFor(() =>
      expect(screen.getAllByRole("option")).toHaveLength(1)
    );
  });

  it("navega entre páginas e desabilita as pontas", async () => {
    const user = userEvent.setup();
    respondeCom([grupo()], 45);
    render(<GruposPage />);

    await screen.findByText("Página 1 de 3");
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Página 2 de 3")).toBeInTheDocument();
    await waitFor(() => expect(ultimaUrl()).toContain("page=2"));

    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(await screen.findByText("Página 1 de 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await screen.findByText("Página 2 de 3");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Página 3 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
  });

  it("não mostra paginação com uma página só", async () => {
    render(<GruposPage />);
    await screen.findByText("Célula Centro");

    expect(
      screen.queryByRole("button", { name: "Próxima" })
    ).not.toBeInTheDocument();
  });

  it("clique na linha abre a ficha do grupo", async () => {
    const user = userEvent.setup();
    render(<GruposPage />);

    await user.click(await screen.findByText("Célula Centro"));

    expect(screen.getByText("sheet:g-1")).toBeInTheDocument();
  });

  it("criação, edição e mudança de tipos recarregam a lista", async () => {
    const user = userEvent.setup();
    render(<GruposPage />);
    await screen.findByText("Célula Centro");
    const antes = getMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "avisar criação" }));
    await user.click(
      screen.getByRole("button", { name: "avisar edição de grupo" })
    );
    await user.click(
      screen.getByRole("button", { name: "avisar mudança de tipos" })
    );

    await waitFor(() => expect(getMock.mock.calls.length).toBe(antes + 3));
    // A mudança de tipos também recarrega o filtro.
    expect(fetchGroupTypesMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("abre os modais de criação e de tipos", async () => {
    const user = userEvent.setup();
    render(<GruposPage />);
    await screen.findByText("Célula Centro");

    await user.click(screen.getByRole("button", { name: "Novo grupo" }));
    expect(screen.getByText("criar:aberto")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Tipos de grupo"));
    expect(screen.getByText("tipos:aberto")).toBeInTheDocument();
  });

  it("pastor edita grupos, mas não gerencia tipos", async () => {
    comPapeis(["pastor"]);
    render(<GruposPage />);
    await screen.findByText("Célula Centro");

    expect(screen.getByRole("button", { name: "Novo grupo" })).toBeInTheDocument();
    expect(screen.getByText("sheet-canEdit:true")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tipos de grupo")).not.toBeInTheDocument();
    expect(screen.queryByText(/^tipos:/)).not.toBeInTheDocument();
  });

  it("admin de congregação gerencia tipos", async () => {
    comPapeis(["admin_congregation"]);
    render(<GruposPage />);
    await screen.findByText("Célula Centro");

    expect(screen.getByLabelText("Tipos de grupo")).toBeInTheDocument();
  });

  it("papel sem permissão só lê", async () => {
    comPapeis(["member"]);
    render(<GruposPage />);
    await screen.findByText("Célula Centro");

    expect(
      screen.queryByRole("button", { name: "Novo grupo" })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tipos de grupo")).not.toBeInTheDocument();
    expect(screen.getByText("sheet-canEdit:false")).toBeInTheDocument();
  });

  it("sessão sem usuário resolvido não libera edição", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<GruposPage />);
    await screen.findByText("Célula Centro");

    expect(screen.getByText("sheet-canEdit:false")).toBeInTheDocument();
  });

  it("resposta e erro de requisição cancelada são descartados", async () => {
    const user = userEvent.setup();
    let resolverPrimeira!: (v: unknown) => void;
    getMock
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolverPrimeira = resolve))
      )
      .mockResolvedValue({
        data: { data: [grupo({ name: "Célula Sul" })], total: 1 },
      } as never);

    render(<GruposPage />);
    // Espera os tipos chegarem: o filtro só tem a opção padrão antes disso.
    await screen.findByRole("option", { name: "Discipulado" });
    await user.selectOptions(screen.getByRole("combobox"), "t-2");
    expect(await screen.findByText("Célula Sul")).toBeInTheDocument();

    resolverPrimeira({ data: { data: [grupo({ name: "Célula Centro" })], total: 1 } });

    await waitFor(() =>
      expect(screen.getByText("Célula Sul")).toBeInTheDocument()
    );
    expect(screen.queryByText("Célula Centro")).not.toBeInTheDocument();
  });

  it("erro de requisição cancelada não zera a lista carregada", async () => {
    const user = userEvent.setup();
    let rejeitarPrimeira!: (e: unknown) => void;
    getMock
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejeitarPrimeira = reject))
      )
      .mockResolvedValue({
        data: { data: [grupo({ name: "Célula Sul" })], total: 1 },
      } as never);

    render(<GruposPage />);
    await screen.findByRole("option", { name: "Discipulado" });
    await user.selectOptions(screen.getByRole("combobox"), "t-2");
    expect(await screen.findByText("Célula Sul")).toBeInTheDocument();

    rejeitarPrimeira(new Error("500"));

    await waitFor(() =>
      expect(screen.getByText("Célula Sul")).toBeInTheDocument()
    );
  });
});
