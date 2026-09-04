import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PessoasPage from "./page";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

// Os quatro filhos de domínio têm spec própria (Fase 9). Aqui só interessa o
// contrato: o que a tela passa para eles e o que faz quando eles avisam.
vi.mock("@/components/persons/PersonSheet", () => ({
  PersonSheet: ({
    personId,
    open,
    onUpdated,
  }: {
    personId: string | null;
    open: boolean;
    onUpdated: () => void;
  }) => (
    <div>
      <span>sheet:{open ? personId : "fechada"}</span>
      <button onClick={onUpdated}>avisar atualização</button>
    </div>
  ),
}));
vi.mock("@/components/persons/CreateVisitorModal", () => ({
  CreateVisitorModal: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: () => void;
  }) => (
    <div>
      <span>criar:{open ? "aberto" : "fechado"}</span>
      <button onClick={onCreated}>avisar cadastro</button>
    </div>
  ),
}));
vi.mock("@/components/persons/ImportCsvModal", () => ({
  ImportCsvModal: ({
    open,
    onImported,
  }: {
    open: boolean;
    onImported: () => void;
  }) => (
    <div>
      <span>importar:{open ? "aberto" : "fechado"}</span>
      <button onClick={onImported}>avisar importação</button>
    </div>
  ),
}));
// O `SearchInput` real tem debounce de 300ms e dispara `onSearch("")` na
// montagem — o que reinicia a página enquanto o teste navega e faz a
// paginação falhar por tempo, não por comportamento. Ele tem spec própria
// (Fase 8); aqui entra sem debounce.
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

vi.mock("@/components/persons/ImportHelpModal", () => ({
  ImportHelpModal: ({ open }: { open: boolean }) => (
    <span>ajuda:{open ? "aberta" : "fechada"}</span>
  ),
}));

const getMock = vi.mocked(api.get);

function pessoa(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "p-1",
    full_name: "Ana Silva",
    phone: "11987654321",
    email: "ana@igreja.com",
    classification: "member",
    created_at: "2026-03-15T12:00:00.000Z",
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

beforeEach(() => {
  getMock.mockReset();
  respondeCom([pessoa()], 1);
  comPapeis(["tenant_admin"]);
});

/** A URL da última chamada a `/persons`. */
function ultimaUrl() {
  return getMock.mock.calls.at(-1)?.[0] as string;
}

describe("PessoasPage", () => {
  it("busca a primeira página e formata telefone, classificação e data", async () => {
    render(<PessoasPage />);

    expect(await screen.findByText("Ana Silva")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/persons?page=1&limit=20");
    expect(screen.getByText("(11) 98765-4321")).toBeInTheDocument();
    expect(screen.getByText("15/03/2026")).toBeInTheDocument();
    expect(screen.getByText("1 pessoa cadastrada")).toBeInTheDocument();
  });

  it("pluraliza a contagem", async () => {
    respondeCom([pessoa(), pessoa({ id: "p-2", full_name: "Bruno" })], 2);
    render(<PessoasPage />);

    expect(await screen.findByText("2 pessoas cadastradas")).toBeInTheDocument();
  });

  it("formata telefone fixo de 10 dígitos e cai no valor cru fora dos dois formatos", async () => {
    respondeCom([
      pessoa({ id: "p-1", full_name: "Fixo", phone: "1133334444" }),
      pessoa({ id: "p-2", full_name: "Estrangeiro", phone: "+1 202 555" }),
      pessoa({ id: "p-3", full_name: "Sem telefone", phone: undefined }),
    ]);

    render(<PessoasPage />);

    expect(await screen.findByText("(11) 3333-4444")).toBeInTheDocument();
    expect(screen.getByText("+1 202 555")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("erro da API deixa a tabela vazia com o texto de estado inicial", async () => {
    getMock.mockRejectedValue(new Error("500"));
    render(<PessoasPage />);

    expect(
      await screen.findByText("Nenhuma pessoa cadastrada ainda.")
    ).toBeInTheDocument();
  });

  it("resposta de requisição cancelada não sobrescreve a lista", async () => {
    const user = userEvent.setup();
    let resolverPrimeira!: (v: unknown) => void;
    getMock
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolverPrimeira = resolve))
      )
      .mockResolvedValue({
        data: { data: [pessoa({ full_name: "Bruno" })], total: 1, page: 1, limit: 20 },
      } as never);

    render(<PessoasPage />);
    // Troca o filtro antes da primeira resposta: o effect anterior é
    // cancelado na limpeza.
    await user.selectOptions(screen.getByRole("combobox"), "member");
    expect(await screen.findByText("Bruno")).toBeInTheDocument();

    resolverPrimeira({
      data: { data: [pessoa({ full_name: "Ana Silva" })], total: 1, page: 1, limit: 20 },
    });

    await waitFor(() => expect(screen.getByText("Bruno")).toBeInTheDocument());
    expect(screen.queryByText("Ana Silva")).not.toBeInTheDocument();
  });

  it("erro de requisição cancelada também é descartado", async () => {
    const user = userEvent.setup();
    let rejeitarPrimeira!: (e: unknown) => void;
    getMock
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejeitarPrimeira = reject))
      )
      .mockResolvedValue({
        data: { data: [pessoa({ full_name: "Bruno" })], total: 1, page: 1, limit: 20 },
      } as never);

    render(<PessoasPage />);
    await user.selectOptions(screen.getByRole("combobox"), "member");
    expect(await screen.findByText("Bruno")).toBeInTheDocument();

    rejeitarPrimeira(new Error("500"));

    await waitFor(() => expect(screen.getByText("Bruno")).toBeInTheDocument());
  });

  it("busca por nome reinicia na página 1 e vai como parâmetro", async () => {
    const user = userEvent.setup();
    render(<PessoasPage />);
    await screen.findByText("Ana Silva");

    await user.type(screen.getByPlaceholderText("Buscar por nome…"), "ana");

    await waitFor(() => expect(ultimaUrl()).toContain("search=ana"));
    expect(ultimaUrl()).toContain("page=1");
  });

  it("filtro de classificação vai como parâmetro e volta para a página 1", async () => {
    const user = userEvent.setup();
    render(<PessoasPage />);
    await screen.findByText("Ana Silva");

    await user.selectOptions(screen.getByRole("combobox"), "member");

    await waitFor(() => expect(ultimaUrl()).toContain("classification=member"));
  });

  it("com filtro ativo o estado vazio muda de texto", async () => {
    const user = userEvent.setup();
    respondeCom([], 0);
    render(<PessoasPage />);

    await user.selectOptions(screen.getByRole("combobox"), "visitor");

    expect(
      await screen.findByText("Nenhuma pessoa encontrada com esses filtros.")
    ).toBeInTheDocument();
  });

  it("navega entre páginas e desabilita as pontas", async () => {
    const user = userEvent.setup();
    respondeCom([pessoa()], 45);
    render(<PessoasPage />);

    await screen.findByText("1–20 de 45");
    expect(screen.getByLabelText("Página anterior")).toBeDisabled();

    await user.click(screen.getByLabelText("Próxima página"));
    await waitFor(() => expect(ultimaUrl()).toContain("page=2"));
    expect(await screen.findByText("21–40 de 45")).toBeInTheDocument();
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Página anterior"));
    expect(await screen.findByText("1–20 de 45")).toBeInTheDocument();

    // Última página: o botão de avançar trava.
    await user.click(screen.getByLabelText("Próxima página"));
    expect(await screen.findByText("21–40 de 45")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Próxima página"));
    expect(await screen.findByText("41–45 de 45")).toBeInTheDocument();
    expect(screen.getByLabelText("Próxima página")).toBeDisabled();
  });

  it("não mostra paginação quando cabe em uma página", async () => {
    render(<PessoasPage />);
    await screen.findByText("Ana Silva");

    expect(screen.queryByLabelText("Próxima página")).not.toBeInTheDocument();
  });

  it("clique na linha abre a ficha da pessoa", async () => {
    const user = userEvent.setup();
    render(<PessoasPage />);

    await user.click(await screen.findByText("Ana Silva"));

    expect(screen.getByText("sheet:p-1")).toBeInTheDocument();
  });

  it("cadastro, importação e edição forçam recarga da lista", async () => {
    const user = userEvent.setup();
    render(<PessoasPage />);
    await screen.findByText("Ana Silva");
    const antes = getMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "avisar cadastro" }));
    await user.click(screen.getByRole("button", { name: "avisar importação" }));
    await user.click(
      screen.getByRole("button", { name: "avisar atualização" })
    );

    await waitFor(() =>
      expect(getMock.mock.calls.length).toBe(antes + 3)
    );
  });

  it("abre os modais de cadastro, importação e ajuda", async () => {
    const user = userEvent.setup();
    render(<PessoasPage />);
    await screen.findByText("Ana Silva");

    await user.click(screen.getByRole("button", { name: /Cadastrar visitante/ }));
    expect(screen.getByText("criar:aberto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Importar CSV/ }));
    expect(screen.getByText("importar:aberto")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Como importar\?/ }));
    expect(screen.getByText("ajuda:aberta")).toBeInTheDocument();
  });

  it("pastor não vê os botões de importação", async () => {
    comPapeis(["pastor"]);
    render(<PessoasPage />);
    await screen.findByText("Ana Silva");

    expect(
      screen.queryByRole("button", { name: /Importar CSV/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Como importar\?/ })
    ).not.toBeInTheDocument();
    // Cadastrar visitante continua disponível.
    expect(
      screen.getByRole("button", { name: /Cadastrar visitante/ })
    ).toBeInTheDocument();
  });

  it("sessão sem usuário resolvido é tratada como não-pastor", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<PessoasPage />);
    await screen.findByText("Ana Silva");

    expect(
      screen.getByRole("button", { name: /Importar CSV/ })
    ).toBeInTheDocument();
  });

  it("cabeçalho da tabela traz as quatro colunas", async () => {
    render(<PessoasPage />);
    const cabecalho = (await screen.findByRole("table")).querySelector("thead")!;

    expect(within(cabecalho).getByText("Nome")).toBeInTheDocument();
    expect(within(cabecalho).getByText("Telefone")).toBeInTheDocument();
    expect(within(cabecalho).getByText("Classificação")).toBeInTheDocument();
    expect(within(cabecalho).getByText("Cadastro")).toBeInTheDocument();
  });
});
