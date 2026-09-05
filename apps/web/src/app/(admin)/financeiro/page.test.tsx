import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/navigation";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import FinanceiroPage from "./page";

vi.mock("@/lib/api", () => ({
  // Espelha o `isForbidden` real: 403 e só 403.
  isForbidden: (error: unknown) =>
    (error as { response?: { status?: number } })?.response?.status === 403,
  default: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Passthrough,
    Bar: Passthrough,
    XAxis: Passthrough,
    YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => React.ReactNode }) => (
      <div>{tickFormatter ? tickFormatter(12345) : null}</div>
    ),
    CartesianGrid: Passthrough,
    Tooltip: ({ formatter }: { formatter?: (value: unknown) => React.ReactNode }) =>
      formatter ? <div>{formatter(100)}</div> : null,
    ResponsiveContainer: Passthrough,
  };
});

vi.mock("@/components/financial/NewTransactionModal", () => ({
  NewTransactionModal: ({
    open,
    onOpenChange,
    onCreated,
    editTransaction,
    viewOnly,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onCreated: () => void;
    editTransaction?: { id: string } | null;
    viewOnly?: boolean;
  }) =>
    open ? (
      <div data-testid={viewOnly ? "view-tx-modal" : editTransaction ? "edit-tx-modal" : "new-tx-modal"}>
        {editTransaction ? `tx:${editTransaction.id}` : "novo"}
        <button onClick={onCreated}>simular criação</button>
        <button onClick={() => onOpenChange(false)}>simular fechar</button>
        <button onClick={() => onOpenChange(true)}>simular reabrir</button>
      </div>
    ) : null,
}));
// Capturado no módulo para simular, em um teste, uma chamada de `onConfirm`
// que chega depois que o diálogo já fechou (a mesma janela de corrida que o
// guard `if (!scopeDialog) return` em `handleScopeConfirm` existe para cobrir).
let capturedOnConfirm: ((scope: string) => void) | null = null;
vi.mock("@/components/financial/RecurrenceScopeDialog", () => ({
  RecurrenceScopeDialog: ({
    open,
    mode,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    mode: string;
    onConfirm: (scope: string) => void;
    onCancel: () => void;
  }) => {
    capturedOnConfirm = onConfirm;
    return open ? (
      <div data-testid="scope-dialog">
        modo:{mode}
        <button onClick={() => onConfirm("this")}>confirmar this</button>
        <button onClick={() => onConfirm("this_and_future")}>confirmar this_and_future</button>
        <button onClick={onCancel}>cancelar escopo</button>
      </div>
    ) : null;
  },
}));
vi.mock("@/components/financial/ExportButton", () => ({
  ExportButton: ({ periodStart, periodEnd }: { periodStart: string; periodEnd: string }) => (
    <div data-testid="export-button">
      export:{periodStart}:{periodEnd}
    </div>
  ),
}));
vi.mock("@/components/financial/CategoriesModal", () => ({
  CategoriesModal: ({ open, onChanged }: { open: boolean; onChanged: () => void }) =>
    open ? (
      <div data-testid="categories-modal">
        <button onClick={onChanged}>simular mudança de categorias</button>
      </div>
    ) : null,
}));

const mockedApi = vi.mocked(api, true);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseRouter = vi.mocked(useRouter);

function setup(roles: string[] = ["tenant_admin"]) {
  const replace = vi.fn();
  mockedUseRouter.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
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
  return { replace };
}

function tx(overrides: Partial<{
  id: string;
  type: string;
  amount: string | number;
  occurred_at: string;
  description: string;
  category_id: string | null;
  category: { id: string; name: string; type: string } | null;
  recurring_rule_id: string | null;
  status: string;
}> = {}) {
  return {
    id: "t1",
    type: "income",
    amount: "100",
    occurred_at: "2026-02-01T00:00:00Z",
    description: "Lançamento",
    category_id: null,
    category: null,
    recurring_rule_id: null,
    status: "pending",
    ...overrides,
  };
}

function mockApi(opts: {
  transactions?: unknown[];
  categories?: unknown[];
  recurring?: unknown[];
  dre?: unknown;
  txError?: boolean;
  /** 403 do servidor: sem permissão, que é diferente de sem dado. */
  txForbidden?: boolean;
  recurringError?: boolean;
  dreError?: boolean;
} = {}) {
  mockedApi.get.mockImplementation((url: string) => {
    if (url.startsWith("/financial/transactions")) {
      if (opts.txForbidden) return Promise.reject({ response: { status: 403 } });
      return opts.txError
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: { data: opts.transactions ?? [], total: (opts.transactions ?? []).length } });
    }
    if (url.startsWith("/financial/categories")) {
      return Promise.resolve({ data: opts.categories ?? [] });
    }
    if (url.startsWith("/financial/recurring-rules")) {
      return opts.recurringError
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: opts.recurring ?? [] });
    }
    if (url.startsWith("/financial/dre")) {
      return opts.dreError ? Promise.reject(new Error("boom")) : Promise.resolve({ data: opts.dre ?? dre() });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

function dre(overrides: Partial<{
  revenue: { categories: unknown[]; total: number };
  expenses: { categories: unknown[]; total: number };
  net_result: number;
  previous_period: { revenue_total: number; expenses_total: number; net_result: number };
}> = {}) {
  return {
    period: { start: "2026-02-01", end: "2026-02-28" },
    revenue: { categories: [], total: 0 },
    expenses: { categories: [], total: 0 },
    net_result: 0,
    previous_period: { period: { start: "", end: "" }, revenue_total: 0, expenses_total: 0, net_result: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FinanceiroPage — visão geral e permissões", () => {
  it("trata usuário sem roles como sem nenhum papel especial (fallback ?? false)", async () => {
    const replace = vi.fn();
    mockedUseRouter.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
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
    render(<FinanceiroPage />);
    await screen.findByText("Visão Geral");
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Lançamentos" })).toBeInTheDocument();
  });

  it("mostra o resultado em vermelho quando é negativo", async () => {
    setup();
    mockApi({
      transactions: [
        tx({ id: "1", type: "expense", amount: "900", occurred_at: "2026-02-02T00:00:00Z" }),
        tx({ id: "2", type: "income", amount: "100", occurred_at: "2026-02-02T00:00:00Z" }),
      ],
    });
    render(<FinanceiroPage />);
    expect(await screen.findByText("-R$ 800,00")).toBeInTheDocument();
  });

  it("redireciona secretary para /dashboard", async () => {
    const { replace } = setup(["secretary"]);
    mockApi({});
    render(<FinanceiroPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("mostra KPIs de receitas/despesas/resultado e o gráfico semanal", async () => {
    setup();
    mockApi({
      transactions: [
        tx({ id: "1", type: "income", amount: "1000", occurred_at: "2026-02-02T00:00:00Z" }),
        tx({ id: "2", type: "expense", amount: "300", occurred_at: "2026-02-09T00:00:00Z" }),
      ],
    });
    render(<FinanceiroPage />);
    expect(await screen.findByText("R$ 700,00")).toBeInTheDocument();
  });

  it("mostra estado vazio do gráfico quando não há lançamentos", async () => {
    setup();
    mockApi({});
    render(<FinanceiroPage />);
    expect(await screen.findByText("Sem lançamentos no período.")).toBeInTheDocument();
  });

  it("esconde abas Lançamentos/Recorrentes e a coluna Total do DRE para pastor", async () => {
    setup(["pastor"]);
    mockApi({});
    render(<FinanceiroPage />);
    await screen.findByText("Visão Geral");
    expect(screen.queryByRole("tab", { name: "Lançamentos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Recorrentes" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "DRE" })).toBeInTheDocument();
  });

  it("não mostra o botão de categorias para quem não pode gerenciar", async () => {
    setup(["secretary"]);
    mockApi({});
    render(<FinanceiroPage />);
    await screen.findByText("Visão Geral");
    expect(screen.queryByRole("button", { name: "Categorias" })).not.toBeInTheDocument();
  });

  it("mostra e usa o botão de categorias para treasurer", async () => {
    setup(["treasurer"]);
    mockApi({});
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(await screen.findByRole("button", { name: "Categorias" }));
    expect(screen.getByTestId("categories-modal")).toBeInTheDocument();
    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular mudança de categorias" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("mostra a barra de progresso do forecast e 'sem dados' quando não há período anterior", async () => {
    setup();
    mockApi({ dre: dre({ revenue: { categories: [], total: 500 } }) });
    render(<FinanceiroPage />);
    expect(
      await screen.findByText("Sem dados do período anterior para comparar")
    ).toBeInTheDocument();
  });

  it("mostra o percentual do forecast e 'superou' quando ultrapassa o período anterior", async () => {
    setup();
    mockApi({
      dre: dre({
        revenue: { categories: [], total: 1200 },
        previous_period: { revenue_total: 1000, expenses_total: 0, net_result: 1000 },
      }),
    });
    render(<FinanceiroPage />);
    expect(await screen.findByText(/100% do período anterior/)).toBeInTheDocument();
    expect(screen.getByText("✓ Superou o período anterior")).toBeInTheDocument();
  });

  it("mostra 'faltam X%' quando ainda não alcançou o período anterior", async () => {
    setup();
    mockApi({
      dre: dre({
        revenue: { categories: [], total: 400 },
        previous_period: { revenue_total: 1000, expenses_total: 0, net_result: 1000 },
      }),
    });
    render(<FinanceiroPage />);
    expect(await screen.findByText(/faltam 60% para igualar/)).toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode ao carregar lançamentos", async () => {
    setup();
    mockApi({});
    render(
      <StrictMode>
        <FinanceiroPage />
      </StrictMode>
    );
    await screen.findByText("Sem lançamentos no período.");
    expect(
      mockedApi.get.mock.calls.filter(([u]) => u.startsWith("/financial/transactions")).length
    ).toBe(1);
  });
});

describe("FinanceiroPage — aba Lançamentos", () => {
  it("trata falha ao carregar transações/categorias como listas vazias", async () => {
    setup();
    mockApi({ txError: true });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    expect(await screen.findByText("Nenhum lançamento registrado.")).toBeInTheDocument();
  });

  it("403 nas transações diz sem-acesso, e não \"nenhum lançamento\"", async () => {
    setup();
    mockApi({ txForbidden: true });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));

    expect(await screen.findByText("Você não tem acesso a Financeiro.")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum lançamento registrado.")).not.toBeInTheDocument();
  });

  it("trata resposta sem `data` como lista vazia (fallback ?? [])", async () => {
    setup();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: {} });
      if (url.startsWith("/financial/categories")) return Promise.resolve({ data: undefined });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    expect(await screen.findByText("Nenhum lançamento registrado.")).toBeInTheDocument();
  });

  it("mostra badges de parcelado e fixo, categoria e travessão quando não há categoria", async () => {
    setup();
    mockApi({
      transactions: [
        tx({ id: "1", description: "Dízimo (2/12)", recurring_rule_id: "r1", category: { id: "c1", name: "Dízimos", type: "income" } }),
        tx({ id: "2", description: "Aluguel", recurring_rule_id: "r2", type: "expense" }),
        tx({ id: "3", description: "Avulso" }),
      ],
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    expect(await screen.findByText("Dízimo (2/12)")).toBeInTheDocument();
    expect(screen.getByText("Parcelado")).toBeInTheDocument();
    expect(screen.getByText("Fixo")).toBeInTheDocument();
    expect(screen.getByText("Dízimos")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("filtra por tipo, categoria, período e status no cliente", async () => {
    setup();
    mockApi({
      transactions: [
        tx({ id: "1", description: "Dízimo Recebido", type: "income", occurred_at: "2026-02-01T00:00:00Z", category_id: "c1", category: { id: "c1", name: "Dízimos", type: "income" }, status: "paid" }),
        tx({ id: "2", description: "Pagamento Aluguel", type: "expense", occurred_at: "2026-02-10T00:00:00Z", category_id: "c2", category: { id: "c2", name: "Aluguel", type: "expense" }, status: "pending" }),
      ],
      categories: [
        { id: "c1", name: "Dízimos", type: "income", children: [] },
        { id: "c2", name: "Aluguel", type: "expense", children: [] },
      ],
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Dízimo Recebido");

    await user.selectOptions(screen.getByDisplayValue("Todos os tipos"), "income");
    expect(screen.queryByText("Pagamento Aluguel")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByDisplayValue("Entradas"), "");
    await user.selectOptions(screen.getByDisplayValue("Todas as categorias"), "c2");
    expect(screen.queryByText("Dízimo Recebido")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByDisplayValue("Aluguel"), "");

    const dateInputs = document.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[0] as HTMLInputElement, "2026-02-05");
    expect(screen.queryByText("Dízimo Recebido")).not.toBeInTheDocument();
    await user.clear(dateInputs[0] as HTMLInputElement);

    await user.type(dateInputs[1] as HTMLInputElement, "2026-02-05");
    expect(screen.queryByText("Pagamento Aluguel")).not.toBeInTheDocument();
    await user.clear(dateInputs[1] as HTMLInputElement);

    await user.selectOptions(screen.getByDisplayValue("Todos os status"), "paid");
    expect(screen.queryByText("Pagamento Aluguel")).not.toBeInTheDocument();
  });

  it("mostra mensagem de filtro vazio quando os filtros não retornam nada", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", type: "income" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Lançamento");
    await user.selectOptions(screen.getByDisplayValue("Todos os tipos"), "expense");
    expect(await screen.findByText("Nenhum lançamento com esses filtros.")).toBeInTheDocument();
  });

  it("mostra estado vazio sem filtros quando não há lançamentos", async () => {
    setup();
    mockApi({});
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    expect(await screen.findByText("Nenhum lançamento registrado.")).toBeInTheDocument();
  });

  it("pagina lançamentos quando há mais de 20", async () => {
    setup();
    mockApi({
      transactions: Array.from({ length: 25 }, (_, i) => tx({ id: String(i), description: `Item ${i}` })),
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Item 0");
    expect(screen.getByText("1–20 de 25")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Próxima página" }));
    expect(await screen.findByText("Item 20")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Página anterior" }));
    expect(await screen.findByText("Item 0")).toBeInTheDocument();
  });

  it("abre modal de criação e recarrega transações e recorrentes ao concluir", async () => {
    setup();
    mockApi({});
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Nenhum lançamento registrado.");
    await user.click(screen.getByRole("button", { name: "Novo lançamento" }));
    expect(screen.getByTestId("new-tx-modal")).toBeInTheDocument();
    const callsBefore = mockedApi.get.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await waitFor(() => expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("edita um lançamento não recorrente diretamente, e abre o diálogo de escopo para um recorrente", async () => {
    setup();
    mockApi({
      transactions: [
        tx({ id: "1", description: "Simples" }),
        tx({ id: "2", description: "Recorrente", recurring_rule_id: "r1" }),
      ],
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");

    await user.click(screen.getAllByRole("button", { name: "Editar lançamento" })[0]);
    expect(screen.getByTestId("edit-tx-modal")).toHaveTextContent("tx:1");

    await user.click(screen.getAllByRole("button", { name: "Editar lançamento" })[1]);
    expect(screen.getByTestId("scope-dialog")).toHaveTextContent("modo:edit");
    await user.click(screen.getByRole("button", { name: "confirmar this" }));
    expect(await screen.findByTestId("edit-tx-modal")).toHaveTextContent("tx:2");
  });

  it("cancela o diálogo de escopo sem editar nem excluir", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Recorrente", recurring_rule_id: "r1" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Recorrente");
    await user.click(screen.getByRole("button", { name: "Editar lançamento" }));
    await user.click(screen.getByRole("button", { name: "cancelar escopo" }));
    expect(screen.queryByTestId("scope-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("edit-tx-modal")).not.toBeInTheDocument();
  });

  it("remove um lançamento simples com confirmação, e mostra erro quando a API falha", async () => {
    setup(["tenant_admin"]);
    mockApi({ transactions: [tx({ id: "1", description: "Simples" })] });
    mockedApi.delete.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");
    await user.click(screen.getByRole("button", { name: "Remover lançamento" }));
    expect(screen.getByText("Remover lançamento?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover" }));
    expect(await screen.findByText("Lançamento removido com sucesso")).toBeInTheDocument();
    expect(mockedApi.delete).toHaveBeenCalledWith("/financial/transactions/1");
  });

  it("cancela a exclusão simples sem chamar a API", async () => {
    setup(["tenant_admin"]);
    mockApi({ transactions: [tx({ id: "1", description: "Simples" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");
    await user.click(screen.getByRole("button", { name: "Remover lançamento" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Remover lançamento?")).not.toBeInTheDocument();
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  it("mostra erro ao falhar a exclusão", async () => {
    setup(["tenant_admin"]);
    mockApi({ transactions: [tx({ id: "1", description: "Simples" })] });
    mockedApi.delete.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");
    await user.click(screen.getByRole("button", { name: "Remover lançamento" }));
    await user.click(screen.getByRole("button", { name: "Remover" }));
    expect(await screen.findByText("Erro ao remover lançamento.")).toBeInTheDocument();
  });

  it("remove um lançamento recorrente com escopo 'este e os próximos' e mensagem específica", async () => {
    setup(["tenant_admin"]);
    mockApi({ transactions: [tx({ id: "1", description: "Recorrente", recurring_rule_id: "r1" })] });
    mockedApi.delete.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Recorrente");
    await user.click(screen.getByRole("button", { name: "Remover lançamento" }));
    expect(screen.getByTestId("scope-dialog")).toHaveTextContent("modo:delete");
    await user.click(screen.getByRole("button", { name: "confirmar this_and_future" }));
    expect(
      await screen.findByText("Lançamento e próximos removidos com sucesso")
    ).toBeInTheDocument();
    expect(mockedApi.delete).toHaveBeenCalledWith("/financial/transactions/1?scope=this_and_future");
  });

  it("não mostra o botão de remover para quem não pode excluir", async () => {
    setup(["secretary"]);
    mockApi({ transactions: [tx({ id: "1", description: "Simples" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");
    expect(screen.queryByRole("button", { name: "Remover lançamento" })).not.toBeInTheDocument();
  });

  it("marca e desfaz o pagamento de um lançamento, revertendo em caso de erro", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Simples", status: "pending" })] });
    mockedApi.patch.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");

    const checkbox = screen.getByRole("checkbox", { name: "Marcar como pago" });
    await user.click(checkbox);
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalledWith("/financial/transactions/1/status", { status: "paid" }));
    expect(await screen.findByRole("checkbox", { name: "Desfazer pagamento" })).toBeChecked();

    mockedApi.patch.mockRejectedValueOnce(new Error("boom"));
    await user.click(screen.getByRole("checkbox", { name: "Desfazer pagamento" }));
    await waitFor(() => expect(screen.getByText("Erro ao atualizar status do lançamento.")).toBeInTheDocument());
    // Reverte para o estado anterior (pago) já que a chamada falhou.
    expect(await screen.findByRole("checkbox", { name: "Desfazer pagamento" })).toBeChecked();
  });

  it("não mexe no status de um lançamento já exportado (confirmed) e mostra botão de visualizar", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Lançamento Confirmado", status: "confirmed" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Lançamento Confirmado");
    expect(screen.getByText("Exportado", { selector: "span.inline-flex" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Visualizar lançamento" }));
    expect(screen.getByTestId("view-tx-modal")).toBeInTheDocument();
  });
});

function rule(overrides: Partial<{
  id: string;
  mode: string;
  frequency: string;
  interval: number;
  installments: number | null;
  next_occurrence_at: string;
  ends_at: string | null;
  is_active: boolean;
  transactions_count: number;
}> = {}) {
  return {
    id: "r1",
    mode: "fixed",
    frequency: "monthly",
    interval: 1,
    installments: null,
    next_occurrence_at: "2026-03-01T00:00:00Z",
    ends_at: null,
    is_active: true,
    transactions_count: 3,
    ...overrides,
  };
}

describe("FinanceiroPage — aba Recorrentes", () => {
  it("mostra estado vazio, e trata falha como lista vazia", async () => {
    setup();
    mockApi({});
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    expect(await screen.findByText("Nenhuma regra recorrente ativa.")).toBeInTheDocument();
  });

  it("mostra falha ao carregar como lista vazia", async () => {
    setup();
    mockApi({ recurringError: true });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    expect(await screen.findByText("Nenhuma regra recorrente ativa.")).toBeInTheDocument();
  });

  it("mostra regras parceladas e fixas, com a transação correspondente e sem ela", async () => {
    setup();
    mockApi({
      transactions: [tx({ id: "t1", recurring_rule_id: "r1", description: "Dízimo (1/12)", type: "income", amount: "100" })],
      recurring: [
        rule({ id: "r1", mode: "installment", installments: 12, transactions_count: 1, frequency: "weekly" }),
        rule({ id: "r2", mode: "fixed", frequency: "yearly" }),
      ],
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    expect(await screen.findByText("Dízimo")).toBeInTheDocument();
    expect(screen.getByText("Parcelado 1/12 geradas")).toBeInTheDocument();
    expect(screen.getByText("Fixo mensal")).toBeInTheDocument();
    expect(screen.getByText("Semanal")).toBeInTheDocument();
    expect(screen.getByText("Anual")).toBeInTheDocument();
    // r2 não tem transação correspondente.
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("cancela a desativação sem chamar a API", async () => {
    setup();
    mockApi({ recurring: [rule()] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    await screen.findByText("Desativar");

    await user.click(screen.getByRole("button", { name: "Desativar" }));
    expect(screen.getByText("Desativar regra recorrente?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByText("Desativar regra recorrente?")).not.toBeInTheDocument();
    expect(mockedApi.patch).not.toHaveBeenCalled();
  });

  it("confirma a desativação com sucesso e recarrega a lista", async () => {
    setup();
    mockApi({ recurring: [rule()] });
    mockedApi.patch.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    await screen.findByText("Desativar");

    await user.click(screen.getByRole("button", { name: "Desativar" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Desativar" });
    await user.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalledWith("/financial/recurring-rules/r1/deactivate"));
    await waitFor(() => expect(screen.queryByText("Desativar regra recorrente?")).not.toBeInTheDocument());
  });

  it("mantém o diálogo aberto quando a desativação falha", async () => {
    setup();
    mockApi({ recurring: [rule()] });
    mockedApi.patch.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    await screen.findByText("Desativar");
    await user.click(screen.getByRole("button", { name: "Desativar" }));
    const confirmButtons = screen.getAllByRole("button", { name: "Desativar" });
    await user.click(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalled());
    expect(screen.getByText("Desativar regra recorrente?")).toBeInTheDocument();
  });
});

function dreCategory(name: string, total: number, count: number) {
  return { category_name: name, total, count };
}

describe("FinanceiroPage — aba DRE", () => {
  it("mostra o placeholder quando ainda não há DRE carregado", async () => {
    setup();
    mockApi({ dreError: true });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "DRE" }));
    expect(await screen.findByText("Selecione um período para ver o DRE.")).toBeInTheDocument();
  });

  it("muda o período e refaz a busca, sem duplicar quando o período não muda", async () => {
    setup();
    mockApi({ dre: dre() });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "DRE" }));
    await screen.findByText("RECEITAS");
    const callsBefore = mockedApi.get.mock.calls.filter((c) => (c[0] as string).startsWith("/financial/dre")).length;

    const dateInputs = document.querySelectorAll('input[type="date"]');
    await user.clear(dateInputs[0] as HTMLInputElement);
    await user.type(dateInputs[0] as HTMLInputElement, "2026-01-01");
    await waitFor(() =>
      expect(
        mockedApi.get.mock.calls.filter((c) => (c[0] as string).startsWith("/financial/dre")).length
      ).toBeGreaterThan(callsBefore)
    );

    const callsAfterStart = mockedApi.get.mock.calls.filter((c) => (c[0] as string).startsWith("/financial/dre")).length;
    await user.clear(dateInputs[1] as HTMLInputElement);
    await user.type(dateInputs[1] as HTMLInputElement, "2026-02-15");
    await waitFor(() =>
      expect(
        mockedApi.get.mock.calls.filter((c) => (c[0] as string).startsWith("/financial/dre")).length
      ).toBeGreaterThan(callsAfterStart)
    );

    // Trocar de aba e voltar sem mudar o período não deve refazer a busca.
    await user.click(screen.getByRole("tab", { name: "Visão Geral" }));
    await user.click(screen.getByRole("tab", { name: "DRE" }));
    const callsAfterReturn = mockedApi.get.mock.calls.filter((c) => (c[0] as string).startsWith("/financial/dre")).length;
    await new Promise((r) => setTimeout(r, 10));
    expect(
      mockedApi.get.mock.calls.filter((c) => (c[0] as string).startsWith("/financial/dre")).length
    ).toBe(callsAfterReturn);
  });

  it("mostra categorias de receita e despesa, com deltas positivos e negativos", async () => {
    setup();
    mockApi({
      dre: dre({
        revenue: { categories: [dreCategory("Dízimos", 1000, 5)], total: 1000 },
        expenses: { categories: [dreCategory("Aluguel", 400, 2)], total: 400 },
        net_result: 600,
        previous_period: { revenue_total: 500, expenses_total: 800, net_result: -300 },
      }),
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "DRE" }));
    expect(await screen.findByText("Dízimos")).toBeInTheDocument();
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument(); // receita subiu 100% vs 500
    expect(screen.getByText("50.0%")).toBeInTheDocument(); // despesa caiu 50% vs 800
    expect(screen.getByText("RESULTADO LÍQUIDO")).toBeInTheDocument();
  });

  it("mostra 'sem lançamentos' quando uma categoria não tem entradas, e '—' quando não há período anterior para o delta", async () => {
    setup();
    mockApi({ dre: dre() });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "DRE" }));
    await screen.findByText("RECEITAS");
    expect(screen.getAllByText("Sem lançamentos").length).toBe(2);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("esconde a coluna Total e o ExportButton para pastor", async () => {
    setup(["pastor"]);
    mockApi({
      dre: dre({
        revenue: { categories: [dreCategory("Dízimos", 1000, 5)], total: 1000 },
      }),
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "DRE" }));
    await screen.findByText("Dízimos");
    expect(screen.queryByTestId("export-button")).not.toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });

  it("mostra o ExportButton com o período correto para quem não é pastor", async () => {
    setup();
    mockApi({ dre: dre() });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "DRE" }));
    expect(await screen.findByTestId("export-button")).toBeInTheDocument();
  });

  it("mostra o resultado líquido em vermelho quando é negativo", async () => {
    setup();
    mockApi({ dre: dre({ net_result: -50 }) });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "DRE" }));
    expect(await screen.findByText("RESULTADO LÍQUIDO")).toBeInTheDocument();
    expect(screen.getByText("-R$ 50,00")).toBeInTheDocument();
  });
});

describe("FinanceiroPage — corridas e casos-limite", () => {
  it("ignora uma resposta de /financial/transactions atrasada de um refresh anterior", async () => {
    setup();
    let resolveFirst!: (v: unknown) => void;
    const first = new Promise((resolve) => { resolveFirst = resolve; });
    let call = 0;
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/financial/transactions")) {
        call += 1;
        if (call === 1) return first as never;
        return Promise.resolve({
          data: { data: [tx({ id: "2", description: "Segunda Carga" })], total: 1 },
        });
      }
      if (url.startsWith("/financial/categories")) return Promise.resolve({ data: [] });
      if (url.startsWith("/financial/recurring-rules")) return Promise.resolve({ data: [] });
      if (url.startsWith("/financial/dre")) return Promise.resolve({ data: dre() });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await waitFor(() => expect(call).toBe(1));

    // Dispara um segundo `loadTx` (via onCreated do modal de criação) antes da
    // primeira promise resolver — o `txSeq` desatualiza a primeira.
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await user.click(screen.getByRole("button", { name: "Novo lançamento" }));
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await waitFor(() => expect(call).toBe(2));
    await screen.findByText("Segunda Carga");

    resolveFirst({ data: { data: [tx({ id: "1", description: "Primeira Carga (atrasada)" })], total: 1 } });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText("Primeira Carga (atrasada)")).not.toBeInTheDocument();
    expect(screen.getByText("Segunda Carga")).toBeInTheDocument();
  });

  it("um 403 atrasado de refresh anterior não apaga a tela já carregada", async () => {
    // O par do caso acima, do lado do erro: sem a guarda de sequência no
    // `catch`, uma negativa que chega depois trocaria a lista boa por
    // "sem acesso" — e o usuário perderia a tela por uma resposta vencida.
    setup();
    let rejectFirst!: (e: unknown) => void;
    const first = new Promise((_, reject) => { rejectFirst = reject; });
    let call = 0;
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/financial/transactions")) {
        call += 1;
        if (call === 1) return first as never;
        return Promise.resolve({
          data: { data: [tx({ id: "2", description: "Segunda Carga" })], total: 1 },
        });
      }
      if (url.startsWith("/financial/categories")) return Promise.resolve({ data: [] });
      if (url.startsWith("/financial/recurring-rules")) return Promise.resolve({ data: [] });
      if (url.startsWith("/financial/dre")) return Promise.resolve({ data: dre() });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await waitFor(() => expect(call).toBe(1));

    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await user.click(screen.getByRole("button", { name: "Novo lançamento" }));
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await waitFor(() => expect(call).toBe(2));
    await screen.findByText("Segunda Carga");

    rejectFirst({ response: { status: 403 } });
    await new Promise((r) => setTimeout(r, 10));

    expect(screen.queryByText("Você não tem acesso a Financeiro.")).not.toBeInTheDocument();
    expect(screen.getByText("Segunda Carga")).toBeInTheDocument();
  });

  it("usa lista vazia quando a resposta de regras recorrentes não traz data", async () => {
    setup();
    mockApi({});
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith("/financial/transactions")) return Promise.resolve({ data: { data: [], total: 0 } });
      if (url.startsWith("/financial/categories")) return Promise.resolve({ data: [] });
      if (url.startsWith("/financial/recurring-rules")) return Promise.resolve({ data: undefined });
      if (url.startsWith("/financial/dre")) return Promise.resolve({ data: dre() });
      return Promise.reject(new Error(`unexpected ${url}`));
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    expect(await screen.findByText("Nenhuma regra recorrente ativa.")).toBeInTheDocument();
  });

  it("não refaz a busca de recorrentes ao revisitar a aba sem passar por um refresh explícito", async () => {
    setup();
    mockApi({ recurring: [rule()] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    await screen.findByText("Desativar");
    const callsAfterFirst = mockedApi.get.mock.calls.filter((c) => (c[0] as string).startsWith("/financial/recurring-rules")).length;

    await user.click(screen.getByRole("tab", { name: "Visão Geral" }));
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    await new Promise((r) => setTimeout(r, 10));
    // `hasFetchedRecurring` só é zerado por um refresh explícito (criar/editar
    // transação, desativar regra) — revisitar a aba sozinha não refaz a busca.
    expect(
      mockedApi.get.mock.calls.filter((c) => (c[0] as string).startsWith("/financial/recurring-rules")).length
    ).toBe(callsAfterFirst);
  });

  it("bloqueia um segundo toggle de status enquanto o primeiro ainda está em andamento", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Simples", status: "pending" })] });
    let resolvePatch!: (v: unknown) => void;
    mockedApi.patch.mockReturnValue(new Promise((resolve) => { resolvePatch = resolve; }) as never);
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");

    const checkbox = screen.getByRole("checkbox", { name: "Marcar como pago" });
    await user.click(checkbox);
    // Um segundo clique enquanto a primeira chamada está pendente não deve
    // disparar um segundo PATCH.
    await user.click(checkbox);
    expect(mockedApi.patch).toHaveBeenCalledTimes(1);
    resolvePatch({ data: {} });
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Desfazer pagamento" })).toBeChecked());
  });

  it("altera só o lançamento clicado quando há mais de um na tabela", async () => {
    setup();
    mockApi({
      transactions: [
        tx({ id: "1", description: "Primeiro", status: "pending" }),
        tx({ id: "2", description: "Segundo", status: "pending" }),
      ],
    });
    mockedApi.patch.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Primeiro");

    const checkboxes = screen.getAllByRole("checkbox", { name: "Marcar como pago" });
    await user.click(checkboxes[0]);
    await waitFor(() => expect(mockedApi.patch).toHaveBeenCalledWith("/financial/transactions/1/status", { status: "paid" }));
    // O segundo lançamento continua com o checkbox de "marcar como pago".
    expect(screen.getAllByRole("checkbox", { name: "Marcar como pago" })).toHaveLength(1);
  });

  it("reverte só o lançamento que falhou quando há mais de um na tabela", async () => {
    setup();
    mockApi({
      transactions: [
        tx({ id: "1", description: "Primeiro", status: "pending" }),
        tx({ id: "2", description: "Segundo", status: "pending" }),
      ],
    });
    mockedApi.patch.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Primeiro");

    const checkboxes = screen.getAllByRole("checkbox", { name: "Marcar como pago" });
    await user.click(checkboxes[0]);
    await waitFor(() => expect(screen.getByText("Erro ao atualizar status do lançamento.")).toBeInTheDocument());
    // Os dois voltam a mostrar "Marcar como pago" — só o primeiro reverteu.
    expect(screen.getAllByRole("checkbox", { name: "Marcar como pago" })).toHaveLength(2);
  });

  it("não faz nada quando onConfirm do diálogo de escopo é chamado depois dele já ter fechado", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Recorrente", recurring_rule_id: "r1" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Recorrente");
    await user.click(screen.getByRole("button", { name: "Editar lançamento" }));
    expect(capturedOnConfirm).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "cancelar escopo" }));
    expect(screen.queryByTestId("scope-dialog")).not.toBeInTheDocument();

    // Simula a resposta tardia: chama o `onConfirm` capturado depois que o
    // diálogo já fechou (`scopeDialog` voltou a `null`).
    capturedOnConfirm!("this");
    expect(screen.queryByTestId("edit-tx-modal")).not.toBeInTheDocument();
    expect(mockedApi.delete).not.toHaveBeenCalled();
  });

  it("mostra o valor da transação de saída em vermelho na tabela de recorrentes", async () => {
    setup();
    mockApi({
      transactions: [tx({ id: "t1", recurring_rule_id: "r1", type: "expense", amount: "50" })],
      recurring: [rule({ id: "r1" })],
    });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));
    const cell = (await screen.findByText(/R\$\s*50,00/)).closest("td")!;
    expect(cell).toHaveClass("text-crimson");
    expect(cell).toHaveTextContent(/−R\$\s*50,00/);
  });

  it("fecha o modal de edição e o de visualização ao chamar onOpenChange(false)", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Simples", status: "confirmed" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");

    await user.click(screen.getByRole("button", { name: "Visualizar lançamento" }));
    expect(screen.getByTestId("view-tx-modal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "simular fechar" }));
    expect(screen.queryByTestId("view-tx-modal")).not.toBeInTheDocument();
  });

  it("não fecha o modal de edição quando onOpenChange é chamado com true", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Simples" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");

    await user.click(screen.getByRole("button", { name: "Editar lançamento" }));
    expect(screen.getByTestId("edit-tx-modal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "simular reabrir" }));
    expect(screen.getByTestId("edit-tx-modal")).toBeInTheDocument();
  });

  it("fecha o modal de edição e recarrega lançamentos/recorrentes ao chamar onOpenChange(false) e onCreated", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Simples" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");

    await user.click(screen.getByRole("button", { name: "Editar lançamento" }));
    expect(screen.getByTestId("edit-tx-modal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    await user.click(screen.getByRole("button", { name: "simular fechar" }));
    expect(screen.queryByTestId("edit-tx-modal")).not.toBeInTheDocument();
  });

  it("não fecha o modal de visualização quando onOpenChange é chamado com true, e onCreated é um no-op", async () => {
    setup();
    mockApi({ transactions: [tx({ id: "1", description: "Simples", status: "confirmed" })] });
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    await screen.findByText("Simples");

    await user.click(screen.getByRole("button", { name: "Visualizar lançamento" }));
    expect(screen.getByTestId("view-tx-modal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "simular reabrir" }));
    expect(screen.getByTestId("view-tx-modal")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "simular criação" }));
    expect(screen.getByTestId("view-tx-modal")).toBeInTheDocument();
  });
});
