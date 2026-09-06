import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TenantsPage from "./page";
import api from "@/lib/api";
import { openSupportSession } from "@/lib/support-session";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/support-session", () => ({ openSupportSession: vi.fn() }));

// O `SearchInput` real tem debounce de 300ms e dispara `onSearch("")` na
// montagem; ele tem spec própria. Aqui entra sem debounce.
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

vi.mock("@/components/tenants/CreateTenantModal", () => ({
  CreateTenantModal: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: () => void;
  }) => (
    <div>
      <span>criar-tenant:{open ? "aberto" : "fechado"}</span>
      <button onClick={onCreated}>avisar tenant criado</button>
    </div>
  ),
}));

const getMock = vi.mocked(api.get);
const abrirSessao = vi.mocked(openSupportSession);

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    slug: "doca-church",
    name: "Doca Church",
    email: "contato@doca.church",
    plan: "premium",
    plan_status: "active",
    trial_ends_at: null,
    congregations_count: 2,
    created_at: "2026-05-10T12:00:00.000Z",
    ...overrides,
  };
}

function respondeCom(data: unknown[]) {
  getMock.mockResolvedValue({ data: { data } } as never);
}

function axiosError(status: number) {
  const headers = new AxiosHeaders();
  const config = { headers };
  return new AxiosError("falhou", "ERR_BAD_REQUEST", config, null, {
    status,
    statusText: "",
    data: {},
    headers,
    config,
  });
}

function ultimaUrl() {
  return getMock.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  getMock.mockReset();
  respondeCom([tenant()]);
  abrirSessao.mockReset().mockResolvedValue(undefined);
});

describe("TenantsPage", () => {
  it("lista os tenants com slug, plano, status, congregações e data", async () => {
    render(<TenantsPage />);

    expect(await screen.findByText("Doca Church")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/platform/tenants?limit=100");
    expect(screen.getByText("doca-church")).toBeInTheDocument();
    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("10/05/2026")).toBeInTheDocument();
    expect(
      screen.getByText(/Todas as igrejas da plataforma\. 1 listada\./)
    ).toBeInTheDocument();
  });

  it("pluraliza a contagem", async () => {
    respondeCom([tenant(), tenant({ id: "t-2", name: "Igreja Nova", slug: "igreja-nova" })]);

    render(<TenantsPage />);

    expect(await screen.findByText(/2 listadas\./)).toBeInTheDocument();
  });

  it("mostra os quatro estados de plano e o tenant sem plano", async () => {
    respondeCom([
      tenant({ id: "t-1", plan_status: "trial" }),
      tenant({ id: "t-2", plan_status: "past_due", plan: "starter" }),
      tenant({ id: "t-3", plan_status: "canceled" }),
      tenant({ id: "t-4", plan: null, plan_status: null }),
    ]);

    render(<TenantsPage />);

    expect(await screen.findByText("Trial")).toBeInTheDocument();
    expect(screen.getByText("Em atraso")).toBeInTheDocument();
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("Cancelado")).toBeInTheDocument();
    // Sem plano: traço, e nenhum selo de status.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("a busca vai como parâmetro e muda o texto do estado vazio", async () => {
    const user = userEvent.setup();
    respondeCom([]);
    render(<TenantsPage />);

    expect(
      await screen.findByText("Nenhum tenant na plataforma ainda.")
    ).toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText("Buscar por nome ou slug…"),
      "doca"
    );

    await waitFor(() => expect(ultimaUrl()).toContain("search=doca"));
    expect(
      await screen.findByText("Nenhum tenant corresponde à busca.")
    ).toBeInTheDocument();
  });

  it("erro na busca mostra o estado de erro da tabela, não o de lista vazia", async () => {
    getMock.mockRejectedValue(new Error("500"));

    render(<TenantsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar os tenants."
    );
    expect(
      screen.queryByText("Nenhum tenant na plataforma ainda.")
    ).not.toBeInTheDocument();
  });

  it("tentar de novo no erro de carregamento refaz a busca", async () => {
    const user = userEvent.setup();
    getMock.mockRejectedValue(new Error("500"));
    render(<TenantsPage />);
    await screen.findByRole("alert");

    respondeCom([tenant({ name: "Igreja Recuperada" })]);
    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));

    expect(await screen.findByText("Igreja Recuperada")).toBeInTheDocument();
  });

  it("resposta de busca cancelada não sobrescreve a lista", async () => {
    const user = userEvent.setup();
    let resolverPrimeira!: (v: unknown) => void;
    getMock
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolverPrimeira = resolve))
      )
      .mockResolvedValue({
        data: { data: [tenant({ name: "Igreja Nova" })] },
      } as never);

    render(<TenantsPage />);
    await user.type(
      screen.getByPlaceholderText("Buscar por nome ou slug…"),
      "nova"
    );
    expect(await screen.findByText("Igreja Nova")).toBeInTheDocument();

    resolverPrimeira({ data: { data: [tenant({ name: "Doca Church" })] } });

    await waitFor(() =>
      expect(screen.getByText("Igreja Nova")).toBeInTheDocument()
    );
    expect(screen.queryByText("Doca Church")).not.toBeInTheDocument();
  });

  it("erro de busca cancelada também é descartado", async () => {
    const user = userEvent.setup();
    let rejeitarPrimeira!: (e: unknown) => void;
    getMock
      .mockImplementationOnce(
        () => new Promise((_, reject) => (rejeitarPrimeira = reject))
      )
      .mockResolvedValue({
        data: { data: [tenant({ name: "Igreja Nova" })] },
      } as never);

    render(<TenantsPage />);
    await user.type(
      screen.getByPlaceholderText("Buscar por nome ou slug…"),
      "nova"
    );
    expect(await screen.findByText("Igreja Nova")).toBeInTheDocument();

    rejeitarPrimeira(new Error("500"));

    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    );
  });

  it("abre o modal de criação e recarrega a lista ao criar", async () => {
    const user = userEvent.setup();
    render(<TenantsPage />);
    await screen.findByText("Doca Church");

    await user.click(screen.getByRole("button", { name: /Novo tenant/ }));
    expect(screen.getByText("criar-tenant:aberto")).toBeInTheDocument();

    const antes = getMock.mock.calls.length;
    await user.click(
      screen.getByRole("button", { name: "avisar tenant criado" })
    );

    await waitFor(() => expect(getMock.mock.calls.length).toBe(antes + 1));
  });
});

describe("TenantsPage — sessão de suporte", () => {
  it("abre a sessão com o id e o nome do tenant, e explica o rastro", async () => {
    const user = userEvent.setup();
    render(<TenantsPage />);

    const botao = await screen.findByRole("button", {
      name: /Entrar no web como suporte/,
    });
    expect(botao).toHaveAttribute(
      "title",
      expect.stringContaining("audit_logs")
    );

    await user.click(botao);

    expect(abrirSessao).toHaveBeenCalledWith("t-1", "Doca Church");
  });

  it("enquanto uma sessão abre, as outras linhas travam", async () => {
    const user = userEvent.setup();
    respondeCom([tenant(), tenant({ id: "t-2", name: "Igreja Nova" })]);
    let liberar!: () => void;
    abrirSessao.mockImplementation(
      () => new Promise<void>((resolve) => (liberar = resolve))
    );

    render(<TenantsPage />);
    const botoes = await screen.findAllByRole("button", {
      name: /Entrar no web como suporte/,
    });
    await user.click(botoes[0]);

    await waitFor(() => expect(botoes[1]).toBeDisabled());

    liberar();
    await waitFor(() => expect(botoes[1]).toBeEnabled());
  });

  it("tenant sem congregação explica por que não dá para entrar", async () => {
    const user = userEvent.setup();
    abrirSessao.mockRejectedValue(axiosError(404));

    render(<TenantsPage />);
    await user.click(
      await screen.findByRole("button", { name: /Entrar no web como suporte/ })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Doca Church não tem congregação — não é possível abrir sessão de suporte."
    );
  });

  it("erro de configuração aparece com a mensagem que nomeia a variável", async () => {
    const user = userEvent.setup();
    abrirSessao.mockRejectedValue(
      new Error(
        "NEXT_PUBLIC_WEB_URL não está definida — sem ela não há para onde abrir a sessão."
      )
    );

    render(<TenantsPage />);
    await user.click(
      await screen.findByRole("button", { name: /Entrar no web como suporte/ })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "NEXT_PUBLIC_WEB_URL não está definida"
    );
  });

  it("qualquer outro erro da API vira mensagem genérica", async () => {
    const user = userEvent.setup();
    abrirSessao.mockRejectedValue(axiosError(500));

    render(<TenantsPage />);
    await user.click(
      await screen.findByRole("button", { name: /Entrar no web como suporte/ })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível abrir a sessão de suporte."
    );
  });

  it("o cabeçalho da tabela traz as colunas esperadas", async () => {
    render(<TenantsPage />);
    const cabecalho = (await screen.findByRole("table")).querySelector("thead")!;

    expect(within(cabecalho).getByText("Igreja")).toBeInTheDocument();
    expect(within(cabecalho).getByText("Plano")).toBeInTheDocument();
    expect(within(cabecalho).getByText("Congregações")).toBeInTheDocument();
    expect(within(cabecalho).getByText("Criado em")).toBeInTheDocument();
  });
});
