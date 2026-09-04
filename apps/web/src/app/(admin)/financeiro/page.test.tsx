import { StrictMode, type ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRouter } from "next/navigation";
import FinanceiroPage from "./page";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

/**
 * Recharts precisa de layout, e o jsdom mede zero: sem os dublês os gráficos
 * não chegam ao DOM e as funções de formatação não rodam. Ver o mesmo padrão
 * na spec do dashboard.
 */
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  BarChart: ({
    data,
    children,
  }: {
    data: { week: string; Entradas: number; "Saídas": number }[];
    children: ReactNode;
  }) => (
    <div data-testid="grafico">
      {data.map((d) => (
        <span key={d.week} data-testid="semana">
          {d.week}: {d.Entradas} / {d["Saídas"]}
        </span>
      ))}
      {children}
    </div>
  ),
  Bar: ({ dataKey }: { dataKey: string }) => <span>barra:{dataKey}</span>,
  XAxis: () => null,
  CartesianGrid: () => null,
  YAxis: ({ tickFormatter }: { tickFormatter?: (v: number) => string }) => (
    <span data-testid="eixo-y">{tickFormatter?.(2500)}</span>
  ),
  Tooltip: ({ formatter }: { formatter?: (v: unknown) => unknown }) => (
    <span data-testid="tooltip">{JSON.stringify(formatter?.(1234.5))}</span>
  ),
}));

interface PropsModal {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  editTransaction?: { id: string } | null;
  scope?: string;
  viewOnly?: boolean;
}

// A tela monta três `NewTransactionModal` (criar, editar e visualizar). O
// dublê distingue os três pelas props que cada um recebe: só o de
// visualização recebe `viewOnly`, e só o de edição recebe `scope`.
vi.mock("@/components/financial/NewTransactionModal", () => ({
  NewTransactionModal: (props: PropsModal) => {
    const papel = props.viewOnly
      ? "ver"
      : "scope" in props
        ? "editar"
        : "criar";
    return (
      <div>
        <span>
          modal-{papel}:
          {props.open ? (props.editTransaction?.id ?? "aberto") : "fechado"}
        </span>
        {props.scope && <span>escopo-{papel}:{props.scope}</span>}
        <button onClick={props.onCreated}>salvou ({papel})</button>
        <button onClick={() => props.onOpenChange(false)}>fechar ({papel})</button>
        <button onClick={() => props.onOpenChange(true)}>abrir ({papel})</button>
      </div>
    );
  },
}));

vi.mock("@/components/financial/RecurrenceScopeDialog", () => ({
  RecurrenceScopeDialog: ({
    open,
    mode,
    isSubmitting,
    onCancel,
    onConfirm,
  }: {
    open: boolean;
    mode: "edit" | "delete";
    isSubmitting: boolean;
    onCancel: () => void;
    onConfirm: (escopo: string) => void;
  }) => (
    <div>
      <span>
        escopo:{open ? mode : "fechado"}
        {isSubmitting ? "|enviando" : ""}
      </span>
      <button onClick={() => onConfirm("only_this")}>confirmar só este</button>
      <button onClick={() => onConfirm("this_and_future")}>
        confirmar este e futuros
      </button>
      <button onClick={onCancel}>cancelar escopo</button>
    </div>
  ),
}));

vi.mock("@/components/financial/ExportButton", () => ({
  ExportButton: ({
    periodStart,
    periodEnd,
  }: {
    periodStart: string;
    periodEnd: string;
  }) => (
    <span>
      exportar:{periodStart}..{periodEnd}
    </span>
  ),
}));

vi.mock("@/components/financial/CategoriesModal", () => ({
  CategoriesModal: ({
    open,
    onChanged,
  }: {
    open: boolean;
    onChanged: () => void;
  }) => (
    <div>
      <span>categorias:{open ? "aberto" : "fechado"}</span>
      <button onClick={onChanged}>avisar categorias mudaram</button>
    </div>
  ),
}));

const getMock = vi.mocked(api.get);
const patchMock = vi.mocked(api.patch);
const deleteMock = vi.mocked(api.delete);
const replace = vi.fn();

/** Quinta-feira, 17/09/2026. */
const AGORA = new Date("2026-09-17T12:00:00.000Z");

function transacao(overrides: Record<string, unknown> = {}) {
  return {
    id: "t-1",
    type: "income",
    amount: "1000.00",
    occurred_at: "2026-09-03T12:00:00.000Z",
    description: "Dízimo",
    category_id: "c-1",
    category: { id: "c-1", name: "Dízimos", type: "income" },
    recurring_rule_id: null,
    status: "pending",
    ...overrides,
  };
}

function categoria(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    name: "Dízimos",
    type: "income",
    children: [],
    ...overrides,
  };
}

function regra(overrides: Record<string, unknown> = {}) {
  return {
    id: "r-1",
    mode: "installment",
    frequency: "monthly",
    interval: 1,
    installments: 12,
    next_occurrence_at: "2026-10-05T12:00:00.000Z",
    ends_at: null,
    is_active: true,
    transactions_count: 3,
    ...overrides,
  };
}

function dre(overrides: Record<string, unknown> = {}) {
  return {
    period: { start: "2026-09-01", end: "2026-09-17" },
    revenue: {
      categories: [{ category_name: "Dízimos", total: 5000, count: 10 }],
      total: 5000,
    },
    expenses: {
      categories: [{ category_name: "Aluguel", total: 2000, count: 1 }],
      total: 2000,
    },
    net_result: 3000,
    previous_period: {
      period: { start: "2026-08-01", end: "2026-08-31" },
      revenue_total: 4000,
      expenses_total: 2500,
      net_result: 1500,
    },
    ...overrides,
  };
}

interface Respostas {
  transacoes?: unknown;
  categorias?: unknown;
  recorrentes?: unknown;
  dre?: unknown;
}

function rotear({ transacoes, categorias, recorrentes, dre: dreResp }: Respostas = {}) {
  // Rejeição entra como função, não como promise já criada: uma promise
  // rejeitada montada aqui e consumida só depois vira unhandled rejection.
  const resolver = (valor: unknown, padrao: unknown) =>
    typeof valor === "function"
      ? ((valor as () => Promise<unknown>)() as never)
      : (Promise.resolve({ data: valor ?? padrao }) as never);

  getMock.mockImplementation((url: string) => {
    if (url.startsWith("/financial/transactions")) {
      return resolver(transacoes, { data: [transacao()], total: 1 });
    }
    if (url === "/financial/categories") {
      return resolver(categorias, [categoria()]);
    }
    if (url === "/financial/recurring-rules") {
      return resolver(recorrentes, [regra()]);
    }
    if (url.startsWith("/financial/dre")) {
      return resolver(dreResp, dre());
    }
    throw new Error(`URL inesperada: ${url}`);
  });
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
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(AGORA);
  getMock.mockReset();
  patchMock.mockReset().mockResolvedValue({ data: {} } as never);
  deleteMock.mockReset().mockResolvedValue({ data: {} } as never);
  replace.mockReset();
  vi.mocked(useRouter).mockReturnValue({
    replace,
  } as unknown as ReturnType<typeof useRouter>);
  rotear();
  comPapeis(["treasurer", "admin_congregation"]);
});

afterEach(() => {
  vi.useRealTimers();
});

async function irPara(
  user: ReturnType<typeof userEvent.setup>,
  aba: string
) {
  await screen.findByText("Visão geral e tesouraria");
  await user.click(screen.getByRole("tab", { name: aba }));
}

describe("FinanceiroPage — visão geral", () => {
  it("busca lançamentos, categorias e o DRE do mês corrente", async () => {
    render(<FinanceiroPage />);

    await waitFor(() => {
      const urls = getMock.mock.calls.map(([u]) => u as string);
      expect(urls).toContain("/financial/transactions?limit=100");
      expect(urls).toContain("/financial/categories");
      expect(urls).toContain(
        "/financial/dre?period_start=2026-09-01&period_end=2026-09-17"
      );
    });
  });

  it("montagem dupla não duplica as buscas", async () => {
    render(
      <StrictMode>
        <FinanceiroPage />
      </StrictMode>
    );

    await waitFor(() =>
      expect(
        getMock.mock.calls.filter(
          ([u]) => u === "/financial/transactions?limit=100"
        )
      ).toHaveLength(1)
    );
  });

  it("soma receitas, despesas e resultado", async () => {
    rotear({
      transacoes: {
        total: 3,
        data: [
          transacao({ id: "t-1", amount: "1000.00" }),
          transacao({ id: "t-2", amount: 500, type: "income" }),
          transacao({ id: "t-3", type: "expense", amount: "300.00" }),
        ],
      },
    });

    render(<FinanceiroPage />);

    expect(await screen.findByText("R$ 1.500,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 300,00")).toBeInTheDocument();
    expect(screen.getByText("R$ 1.200,00")).toBeInTheDocument();
  });

  it("resultado negativo aparece em vermelho", async () => {
    rotear({
      transacoes: {
        total: 1,
        data: [transacao({ type: "expense", amount: "100.00" })],
      },
    });

    render(<FinanceiroPage />);

    const resultado = await screen.findByText("-R$ 100,00");
    expect(resultado.className).toContain("text-crimson");
  });

  it("agrupa o gráfico por semana do mês", async () => {
    rotear({
      transacoes: {
        total: 3,
        data: [
          transacao({ id: "t-1", occurred_at: "2026-09-03T12:00:00.000Z" }),
          transacao({
            id: "t-2",
            occurred_at: "2026-09-16T12:00:00.000Z",
            type: "expense",
            amount: "250.00",
          }),
          transacao({
            id: "t-3",
            occurred_at: "2026-09-17T12:00:00.000Z",
            amount: "100.00",
          }),
        ],
      },
    });

    render(<FinanceiroPage />);

    const semanas = await screen.findAllByTestId("semana");
    expect(semanas.map((s) => s.textContent)).toEqual([
      "Sem 1: 1000 / 0",
      "Sem 3: 100 / 250",
    ]);
    expect(screen.getByTestId("eixo-y")).toHaveTextContent("R$3k");
    expect(screen.getByTestId("tooltip")).toHaveTextContent('["R$ 1.234,50"]');
  });

  it("sem lançamentos o gráfico dá lugar a um aviso", async () => {
    rotear({ transacoes: { total: 0, data: [] } });

    render(<FinanceiroPage />);

    expect(
      await screen.findByText("Sem lançamentos no período.")
    ).toBeInTheDocument();
    expect(screen.queryByTestId("grafico")).not.toBeInTheDocument();
  });

  it("resposta sem `data` não quebra a tela", async () => {
    rotear({ transacoes: { total: 0 }, categorias: null });

    render(<FinanceiroPage />);

    expect(
      await screen.findByText("Sem lançamentos no período.")
    ).toBeInTheDocument();
  });

  it("erro nas buscas de lançamento deixa a tela vazia, sem quebrar", async () => {
    rotear({ transacoes: () => Promise.reject(new Error("500")) });

    render(<FinanceiroPage />);

    expect(
      await screen.findByText("Sem lançamentos no período.")
    ).toBeInTheDocument();
  });

  it("compara a receita com o período anterior", async () => {
    render(<FinanceiroPage />);

    // 5000 sobre 4000 = 125%, limitado a 100%.
    expect(
      await screen.findByText("100% do período anterior (R$ 4.000,00)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("✓ Superou o período anterior")
    ).toBeInTheDocument();
    expect(screen.getByText("R$ 5.000,00 este mês")).toBeInTheDocument();
  });

  it("receita abaixo do período anterior mostra o quanto falta", async () => {
    rotear({
      dre: dre({
        revenue: { categories: [], total: 2000 },
        previous_period: {
          period: { start: "2026-08-01", end: "2026-08-31" },
          revenue_total: 4000,
          expenses_total: 0,
          net_result: 0,
        },
      }),
    });

    render(<FinanceiroPage />);

    expect(
      await screen.findByText("50% do período anterior (R$ 4.000,00)")
    ).toBeInTheDocument();
    expect(screen.getByText("faltam 50% para igualar")).toBeInTheDocument();
  });

  it("sem período anterior o comparativo avisa em vez de mostrar 100%", async () => {
    rotear({
      dre: dre({
        previous_period: {
          period: { start: "2026-08-01", end: "2026-08-31" },
          revenue_total: 0,
          expenses_total: 0,
          net_result: 0,
        },
      }),
    });

    render(<FinanceiroPage />);

    expect(
      await screen.findByText("Sem dados do período anterior para comparar")
    ).toBeInTheDocument();
  });

  it("erro no DRE deixa o comparativo em carregamento", async () => {
    rotear({ dre: () => Promise.reject(new Error("500")) });

    render(<FinanceiroPage />);

    await screen.findByText("Receitas vs período anterior");
    expect(
      screen.queryByText(/do período anterior/)
    ).not.toBeInTheDocument();
  });
});

describe("FinanceiroPage — lançamentos", () => {
  it("mostra data, descrição, categoria, tipo, valor e status", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 2,
        data: [
          transacao(),
          transacao({
            id: "t-2",
            type: "expense",
            amount: "250.50",
            description: "Aluguel",
            occurred_at: "2026-09-10T12:00:00.000Z",
            category: null,
            category_id: null,
            status: "paid",
          }),
        ],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    const tabela = await screen.findByRole("table");
    expect(within(tabela).getByText("03/09/2026")).toBeInTheDocument();
    expect(within(tabela).getByText("Dízimo")).toBeInTheDocument();
    expect(within(tabela).getByText("Dízimos")).toBeInTheDocument();
    expect(within(tabela).getByText("Entrada")).toBeInTheDocument();
    expect(within(tabela).getByText("+R$ 1.000,00")).toBeInTheDocument();
    expect(within(tabela).getByText("Não pago")).toBeInTheDocument();
    // Sem categoria: traço.
    expect(within(tabela).getByText("—")).toBeInTheDocument();
    expect(within(tabela).getByText("Saída")).toBeInTheDocument();
    expect(within(tabela).getByText("−R$ 250,50")).toBeInTheDocument();
    expect(within(tabela).getByText("Pago")).toBeInTheDocument();
  });

  it("marca parcelado, fixo e exportado", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 3,
        data: [
          transacao({
            id: "t-1",
            description: "Cadeiras (3/12)",
            recurring_rule_id: "r-1",
          }),
          transacao({
            id: "t-2",
            description: "Aluguel",
            recurring_rule_id: "r-2",
          }),
          transacao({ id: "t-3", status: "confirmed" }),
        ],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    const tabela = await screen.findByRole("table");
    expect(within(tabela).getByText("Parcelado")).toBeInTheDocument();
    expect(within(tabela).getByText("Fixo")).toBeInTheDocument();
    // "Exportado" também é opção do filtro de status.
    expect(within(tabela).getByText("Exportado")).toBeInTheDocument();
    // Exportado não tem checkbox de status nem botões de editar/remover.
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Visualizar lançamento" })
    ).toBeInTheDocument();
  });

  it("filtra por tipo, categoria, datas e status", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 3,
        data: [
          transacao({ id: "t-1", description: "Dízimo de setembro" }),
          transacao({
            id: "t-2",
            type: "expense",
            description: "Aluguel",
            category_id: "c-2",
            category: { id: "c-2", name: "Estrutura", type: "expense" },
            occurred_at: "2026-09-20T12:00:00.000Z",
            status: "paid",
          }),
        ],
      },
      categorias: [
        categoria(),
        categoria({ id: "c-2", name: "Estrutura", type: "expense" }),
      ],
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");
    await screen.findByText("Dízimo de setembro");

    const [tipo, categoriaSel, status] = screen.getAllByRole("combobox");

    await user.selectOptions(tipo, "expense");
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
    expect(screen.queryByText("Dízimo de setembro")).not.toBeInTheDocument();
    // A lista de categorias acompanha o tipo escolhido.
    expect(
      within(categoriaSel).queryByRole("option", { name: "Dízimos" })
    ).not.toBeInTheDocument();

    await user.selectOptions(categoriaSel, "c-2");
    expect(screen.getByText("Aluguel")).toBeInTheDocument();

    await user.selectOptions(tipo, "");
    await user.selectOptions(status, "paid");
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
    expect(screen.queryByText("Dízimo de setembro")).not.toBeInTheDocument();

    await user.selectOptions(status, "");
    expect(screen.getByText("Dízimo de setembro")).toBeInTheDocument();
  });

  it("as datas do filtro cortam o intervalo", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 2,
        data: [
          transacao({ id: "t-1", occurred_at: "2026-09-01T12:00:00.000Z" }),
          transacao({
            id: "t-2",
            description: "Mais tarde",
            occurred_at: "2026-09-25T12:00:00.000Z",
          }),
        ],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");
    await screen.findByText("Dízimo");

    const datas = document.querySelectorAll<HTMLInputElement>(
      'input[type="date"]'
    );
    await user.type(datas[0], "2026-09-10");
    expect(screen.getByText("Mais tarde")).toBeInTheDocument();
    expect(screen.queryByText("Dízimo")).not.toBeInTheDocument();

    await user.clear(datas[0]);
    await user.type(datas[1], "2026-09-10");
    expect(await screen.findByText("Dízimo")).toBeInTheDocument();
    expect(screen.queryByText("Mais tarde")).not.toBeInTheDocument();
  });

  it("o estado vazio distingue 'sem nada' de 'sem resultado no filtro'", async () => {
    const user = userEvent.setup();
    rotear({ transacoes: { total: 0, data: [] } });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    expect(
      await screen.findByText("Nenhum lançamento registrado.")
    ).toBeInTheDocument();

    await user.selectOptions(screen.getAllByRole("combobox")[0], "income");
    expect(
      await screen.findByText("Nenhum lançamento com esses filtros.")
    ).toBeInTheDocument();
  });

  it("pagina de 20 em 20", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 25,
        data: Array.from({ length: 25 }, (_, i) =>
          transacao({ id: `t-${i}`, description: `Lançamento ${i}` })
        ),
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    expect(await screen.findByText("1–20 de 25")).toBeInTheDocument();
    expect(screen.getByLabelText("Página anterior")).toBeDisabled();

    await user.click(screen.getByLabelText("Próxima página"));
    expect(await screen.findByText("21–25 de 25")).toBeInTheDocument();
    expect(screen.getByLabelText("Próxima página")).toBeDisabled();

    await user.click(screen.getByLabelText("Página anterior"));
    expect(await screen.findByText("1–20 de 25")).toBeInTheDocument();

    // Trocar de aba volta para a primeira página.
    await user.click(screen.getByRole("tab", { name: "Visão Geral" }));
    await user.click(screen.getByRole("tab", { name: "Lançamentos" }));
    expect(await screen.findByText("1–20 de 25")).toBeInTheDocument();
  });

  it("marcar como pago manda o status novo e mantém a lista", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Marcar como pago"));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        "/financial/transactions/t-1/status",
        { status: "paid" }
      )
    );
    expect(await screen.findByLabelText("Desfazer pagamento")).toBeChecked();
  });

  it("desfazer pagamento volta o status para pendente", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: { total: 1, data: [transacao({ status: "paid" })] },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Desfazer pagamento"));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        "/financial/transactions/t-1/status",
        { status: "pending" }
      )
    );
  });

  it("falha no status desfaz a mudança otimista e avisa", async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(new Error("500"));

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Marcar como pago"));

    expect(
      await screen.findByText("Erro ao atualizar status do lançamento.")
    ).toBeInTheDocument();
    expect(await screen.findByLabelText("Marcar como pago")).not.toBeChecked();
  });

  it("um clique por vez: enquanto a chamada não volta o checkbox trava", async () => {
    const user = userEvent.setup();
    let liberar!: (v: unknown) => void;
    patchMock.mockImplementation(
      () => new Promise((resolve) => (liberar = resolve)) as never
    );

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Marcar como pago"));
    await waitFor(() =>
      expect(screen.getByLabelText("Desfazer pagamento")).toBeDisabled()
    );
    expect(patchMock).toHaveBeenCalledTimes(1);

    liberar({ data: {} });
    await waitFor(() =>
      expect(screen.getByLabelText("Desfazer pagamento")).toBeEnabled()
    );
  });

  it("abre o modal de criar e o de editar lançamento simples", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(
      await screen.findByRole("button", { name: /Novo lançamento/ })
    );
    expect(screen.getByText("modal-criar:aberto")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Editar lançamento"));
    expect(screen.getByText("modal-editar:t-1")).toBeInTheDocument();

    // Fechar limpa o lançamento em edição.
    await user.click(screen.getByRole("button", { name: "fechar (editar)" }));
    expect(screen.getByText("modal-editar:fechado")).toBeInTheDocument();
  });

  it("visualizar lançamento exportado abre o modal só de leitura", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: { total: 1, data: [transacao({ status: "confirmed" })] },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(
      await screen.findByLabelText("Visualizar lançamento")
    );
    expect(screen.getByText("modal-ver:t-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "fechar (ver)" }));
    expect(screen.getByText("modal-ver:fechado")).toBeInTheDocument();
  });

  it("pedido de abrir vindo do modal não fecha o que está em edição", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Editar lançamento"));
    expect(screen.getByText("modal-editar:t-1")).toBeInTheDocument();

    // `onOpenChange(true)` é ignorado: quem abre é a tela, ao escolher a linha.
    await user.click(screen.getByRole("button", { name: "abrir (editar)" }));
    expect(screen.getByText("modal-editar:t-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "abrir (ver)" }));
    expect(screen.getByText("modal-ver:fechado")).toBeInTheDocument();
    // O modal de leitura não recarrega nada ao "salvar".
    await user.click(screen.getByRole("button", { name: "salvou (ver)" }));
    expect(screen.getByText("modal-ver:fechado")).toBeInTheDocument();
  });

  it("categorias ausentes na resposta não quebram o filtro", async () => {
    const user = userEvent.setup();
    rotear({ categorias: () => Promise.resolve({ data: null }) });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await screen.findByText("Dízimo");
    const categoriaSel = screen.getAllByRole("combobox")[1];
    expect(within(categoriaSel).getAllByRole("option")).toHaveLength(1);
  });

  it("filtro de categoria exclui o que é de outra categoria", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 2,
        data: [
          transacao({ id: "t-1", description: "Dízimo" }),
          transacao({
            id: "t-2",
            description: "Oferta",
            category_id: "c-3",
            category: { id: "c-3", name: "Ofertas", type: "income" },
          }),
        ],
      },
      categorias: [
        categoria(),
        categoria({ id: "c-3", name: "Ofertas", type: "income" }),
      ],
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");
    await screen.findByText("Oferta");

    await user.selectOptions(screen.getAllByRole("combobox")[1], "c-3");

    expect(screen.getByText("Oferta")).toBeInTheDocument();
    expect(screen.queryByText("Dízimo")).not.toBeInTheDocument();
  });

  it("marcar um lançamento não mexe no status dos outros", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 2,
        data: [
          transacao({ id: "t-1", description: "Dízimo" }),
          transacao({
            id: "t-2",
            description: "Oferta",
            occurred_at: "2026-09-11T12:00:00.000Z",
          }),
        ],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    const caixas = await screen.findAllByLabelText("Marcar como pago");
    await user.click(caixas[0]);

    await waitFor(() =>
      expect(screen.getByLabelText("Desfazer pagamento")).toBeChecked()
    );
    // O segundo continua pendente.
    expect(screen.getByLabelText("Marcar como pago")).not.toBeChecked();
  });

  it("falha no status devolve só o lançamento afetado", async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(new Error("500"));
    rotear({
      transacoes: {
        total: 2,
        data: [
          transacao({ id: "t-1", description: "Dízimo" }),
          transacao({
            id: "t-2",
            description: "Oferta",
            occurred_at: "2026-09-11T12:00:00.000Z",
            status: "paid",
          }),
        ],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Marcar como pago"));

    expect(
      await screen.findByText("Erro ao atualizar status do lançamento.")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Marcar como pago")).not.toBeChecked();
    // O que já estava pago segue pago.
    expect(screen.getByLabelText("Desfazer pagamento")).toBeChecked();
  });

  it("salvar em qualquer um dos modais recarrega os dados", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");
    await screen.findByText("Dízimo");

    const chamadas = () =>
      getMock.mock.calls.filter(
        ([u]) => u === "/financial/transactions?limit=100"
      ).length;
    expect(chamadas()).toBe(1);

    await user.click(screen.getByRole("button", { name: "salvou (criar)" }));
    await waitFor(() => expect(chamadas()).toBe(2));

    await user.click(screen.getByRole("button", { name: "salvou (editar)" }));
    await waitFor(() => expect(chamadas()).toBe(3));
  });

  it("resposta de busca antiga não sobrescreve a recarga", async () => {
    const user = userEvent.setup();
    let resolverPrimeira!: (v: unknown) => void;
    const pendente = new Promise((resolve) => (resolverPrimeira = resolve));
    let primeira = true;
    getMock.mockImplementation((url: string) => {
      if (url === "/financial/transactions?limit=100") {
        if (primeira) {
          primeira = false;
          return pendente as never;
        }
        return Promise.resolve({
          data: { data: [transacao({ description: "Recarregado" })], total: 1 },
        }) as never;
      }
      if (url === "/financial/categories") return Promise.resolve({ data: [categoria()] }) as never;
      if (url === "/financial/recurring-rules") return Promise.resolve({ data: [] }) as never;
      return Promise.resolve({ data: dre() }) as never;
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    // Recarrega antes da primeira resposta chegar.
    await user.click(screen.getByRole("button", { name: "salvou (criar)" }));
    expect(await screen.findByText("Recarregado")).toBeInTheDocument();

    resolverPrimeira({
      data: { data: [transacao({ description: "Antigo" })], total: 1 },
    });

    await waitFor(() =>
      expect(screen.getByText("Recarregado")).toBeInTheDocument()
    );
    expect(screen.queryByText("Antigo")).not.toBeInTheDocument();
  });
});

describe("FinanceiroPage — remoção de lançamento", () => {
  it("pede confirmação e remove o lançamento simples", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Remover lançamento"));
    expect(screen.getByText("Remover lançamento?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remover" }));

    await waitFor(() =>
      expect(deleteMock).toHaveBeenCalledWith("/financial/transactions/t-1")
    );
    expect(
      await screen.findByText("Lançamento removido com sucesso")
    ).toBeInTheDocument();
    expect(screen.queryByText("Remover lançamento?")).not.toBeInTheDocument();
  });

  it("cancelar fecha a confirmação sem chamar a API", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Remover lançamento"));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByText("Remover lançamento?")).not.toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("falha na remoção avisa e mantém o lançamento", async () => {
    const user = userEvent.setup();
    deleteMock.mockRejectedValue(new Error("500"));

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Remover lançamento"));
    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(
      await screen.findByText("Erro ao remover lançamento.")
    ).toBeInTheDocument();
  });

  it("o aviso desaparece depois de três segundos", async () => {
    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime.bind(vi),
    });
    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Remover lançamento"));
    await user.click(screen.getByRole("button", { name: "Remover" }));
    await screen.findByText("Lançamento removido com sucesso");

    await vi.advanceTimersByTimeAsync(3000);

    await waitFor(() =>
      expect(
        screen.queryByText("Lançamento removido com sucesso")
      ).not.toBeInTheDocument()
    );
  });

  it("lançamento recorrente pergunta o escopo antes de remover", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 1,
        data: [transacao({ recurring_rule_id: "r-1" })],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Remover lançamento"));
    expect(screen.getByText("escopo:delete")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "confirmar este e futuros" })
    );

    await waitFor(() =>
      expect(deleteMock).toHaveBeenCalledWith(
        "/financial/transactions/t-1?scope=this_and_future"
      )
    );
    expect(
      await screen.findByText("Lançamento e próximos removidos com sucesso")
    ).toBeInTheDocument();
  });

  it("escopo 'só este' remove apenas a ocorrência", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 1,
        data: [transacao({ recurring_rule_id: "r-1" })],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Remover lançamento"));
    await user.click(
      screen.getByRole("button", { name: "confirmar só este" })
    );

    await waitFor(() =>
      expect(deleteMock).toHaveBeenCalledWith(
        "/financial/transactions/t-1?scope=only_this"
      )
    );
    expect(
      await screen.findByText("Lançamento removido com sucesso")
    ).toBeInTheDocument();
  });

  it("editar recorrente pergunta o escopo e o repassa ao modal", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 1,
        data: [transacao({ recurring_rule_id: "r-1" })],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Editar lançamento"));
    expect(screen.getByText("escopo:edit")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "confirmar este e futuros" })
    );

    expect(screen.getByText("modal-editar:t-1")).toBeInTheDocument();
    expect(
      screen.getByText("escopo-editar:this_and_future")
    ).toBeInTheDocument();
    expect(screen.getByText("escopo:fechado")).toBeInTheDocument();

    // Fechar o modal limpa o escopo.
    await user.click(screen.getByRole("button", { name: "fechar (editar)" }));
    expect(
      screen.queryByText("escopo-editar:this_and_future")
    ).not.toBeInTheDocument();
  });

  it("cancelar o diálogo de escopo não chama nada", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 1,
        data: [transacao({ recurring_rule_id: "r-1" })],
      },
    });

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await user.click(await screen.findByLabelText("Editar lançamento"));
    await user.click(screen.getByRole("button", { name: "cancelar escopo" }));

    expect(screen.getByText("escopo:fechado")).toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();

    // Confirmar sem diálogo aberto é ignorado.
    await user.click(
      screen.getByRole("button", { name: "confirmar só este" })
    );
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("quem não pode remover não vê o botão", async () => {
    const user = userEvent.setup();
    comPapeis(["treasurer"]);

    render(<FinanceiroPage />);
    await irPara(user, "Lançamentos");

    await screen.findByText("Dízimo");
    expect(
      screen.queryByLabelText("Remover lançamento")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Editar lançamento")).toBeInTheDocument();
  });
});

describe("FinanceiroPage — recorrentes", () => {
  it("lista as regras com modo, valor, frequência e próxima ocorrência", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 1,
        data: [
          transacao({
            id: "t-1",
            description: "Cadeiras (3/12)",
            recurring_rule_id: "r-1",
            type: "expense",
            amount: "400.00",
          }),
        ],
      },
      recorrentes: [
        regra(),
        regra({
          id: "r-2",
          mode: "fixed",
          frequency: "weekly",
          installments: null,
          transactions_count: 8,
          next_occurrence_at: "2026-10-12T12:00:00.000Z",
        }),
      ],
    });

    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");

    expect(await screen.findByText("Cadeiras")).toBeInTheDocument();
    expect(
      screen.getByText("Parcelado 3/12 geradas")
    ).toBeInTheDocument();
    expect(screen.getByText("−R$ 400,00")).toBeInTheDocument();
    expect(screen.getByText("Mensal")).toBeInTheDocument();
    expect(screen.getByText("05/10/2026")).toBeInTheDocument();

    // A segunda regra não tem lançamento correspondente.
    expect(screen.getByText("Fixo mensal")).toBeInTheDocument();
    expect(screen.getByText("Semanal")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("frequência anual e entrada recorrente", async () => {
    const user = userEvent.setup();
    rotear({
      transacoes: {
        total: 1,
        data: [
          transacao({ id: "t-1", recurring_rule_id: "r-1", amount: "90.00" }),
        ],
      },
      recorrentes: [regra({ frequency: "yearly", mode: "fixed" })],
    });

    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");

    expect(await screen.findByText("Anual")).toBeInTheDocument();
    expect(screen.getByText("+R$ 90,00")).toBeInTheDocument();
  });

  it("sem regras mostra o estado vazio", async () => {
    const user = userEvent.setup();
    rotear({ recorrentes: [] });

    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");

    expect(
      await screen.findByText("Nenhuma regra recorrente ativa.")
    ).toBeInTheDocument();
  });

  it("resposta vazia e erro caem no mesmo estado", async () => {
    const user = userEvent.setup();
    // `data` ausente na resposta: o `?? []` da tela é o que segura.
    rotear({ recorrentes: () => Promise.resolve({ data: undefined }) });
    const { unmount } = render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");
    expect(
      await screen.findByText("Nenhuma regra recorrente ativa.")
    ).toBeInTheDocument();
    unmount();

    rotear({ recorrentes: () => Promise.reject(new Error("500")) });
    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");
    expect(
      await screen.findByText("Nenhuma regra recorrente ativa.")
    ).toBeInTheDocument();
  });

  it("desativar pede confirmação, chama a API e recarrega", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");

    await user.click(await screen.findByRole("button", { name: "Desativar" }));
    expect(
      screen.getByText("Desativar regra recorrente?")
    ).toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Desativar" }).at(-1)!
    );

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith(
        "/financial/recurring-rules/r-1/deactivate"
      )
    );
    await waitFor(() =>
      expect(
        getMock.mock.calls.filter(([u]) => u === "/financial/recurring-rules")
      ).toHaveLength(2)
    );
  });

  it("voltar para a aba não repete a busca das regras", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");
    await screen.findByRole("button", { name: "Desativar" });

    await user.click(screen.getByRole("tab", { name: "Visão Geral" }));
    await user.click(screen.getByRole("tab", { name: "Recorrentes" }));

    expect(
      getMock.mock.calls.filter(([u]) => u === "/financial/recurring-rules")
    ).toHaveLength(1);
  });

  it("cancelar a desativação não chama a API", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");

    await user.click(await screen.findByRole("button", { name: "Desativar" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByText("Desativar regra recorrente?")
    ).not.toBeInTheDocument();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it("falha ao desativar mantém a regra e libera os botões", async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(new Error("500"));

    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");

    await user.click(await screen.findByRole("button", { name: "Desativar" }));
    await user.click(
      screen.getAllByRole("button", { name: "Desativar" }).at(-1)!
    );

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect(
      screen.getByText("Desativar regra recorrente?")
    ).toBeInTheDocument();
  });

  it("enquanto desativa, os dois botões travam", async () => {
    const user = userEvent.setup();
    let liberar!: (v: unknown) => void;
    patchMock.mockImplementation(
      () => new Promise((resolve) => (liberar = resolve)) as never
    );

    render(<FinanceiroPage />);
    await irPara(user, "Recorrentes");

    await user.click(await screen.findByRole("button", { name: "Desativar" }));
    await user.click(
      screen.getAllByRole("button", { name: "Desativar" }).at(-1)!
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
    );

    liberar({ data: {} });
    await waitFor(() =>
      expect(
        screen.queryByText("Desativar regra recorrente?")
      ).not.toBeInTheDocument()
    );
  });
});

describe("FinanceiroPage — DRE", () => {
  it("mostra receitas, despesas, resultado e a variação do período anterior", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "DRE");

    expect(await screen.findByText("RECEITAS")).toBeInTheDocument();
    expect(screen.getByText("Dízimos")).toBeInTheDocument();
    expect(screen.getByText("Aluguel")).toBeInTheDocument();
    expect(screen.getByText("RESULTADO LÍQUIDO")).toBeInTheDocument();
    // 5000 sobre 4000: +25%; despesas 2000 sobre 2500: −20%; resultado
    // 3000 sobre 1500: +100%.
    expect(screen.getByText("25.0%")).toBeInTheDocument();
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    expect(screen.getByText("100.0%")).toBeInTheDocument();
    expect(screen.getByText("exportar:2026-09-01..2026-09-17")).toBeInTheDocument();
  });

  it("período anterior zerado deixa a variação em traço", async () => {
    const user = userEvent.setup();
    rotear({
      dre: dre({
        previous_period: {
          period: { start: "2026-08-01", end: "2026-08-31" },
          revenue_total: 0,
          expenses_total: 0,
          net_result: 0,
        },
      }),
    });

    render(<FinanceiroPage />);
    await irPara(user, "DRE");

    await screen.findByText("RECEITAS");
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("resultado negativo sai em vermelho", async () => {
    const user = userEvent.setup();
    rotear({ dre: dre({ net_result: -500 }) });

    render(<FinanceiroPage />);
    await irPara(user, "DRE");

    const celula = await screen.findByText("-R$ 500,00");
    expect(celula.className).toContain("text-crimson");
  });

  it("sem categorias no período cada grupo avisa", async () => {
    const user = userEvent.setup();
    rotear({
      dre: dre({
        revenue: { categories: [], total: 0 },
        expenses: { categories: [], total: 0 },
      }),
    });

    render(<FinanceiroPage />);
    await irPara(user, "DRE");

    expect(await screen.findAllByText("Sem lançamentos")).toHaveLength(2);
  });

  it("trocar o período refaz a busca", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "DRE");
    await screen.findByText("RECEITAS");

    const datas = document.querySelectorAll<HTMLInputElement>(
      'input[type="date"]'
    );
    await user.clear(datas[0]);
    await user.type(datas[0], "2026-08-01");

    await waitFor(() =>
      expect(
        getMock.mock.calls.some(
          ([u]) => u === "/financial/dre?period_start=2026-08-01&period_end=2026-09-17"
        )
      ).toBe(true)
    );

    await user.clear(datas[1]);
    await user.type(datas[1], "2026-08-31");

    await waitFor(() =>
      expect(
        getMock.mock.calls.some(
          ([u]) => u === "/financial/dre?period_start=2026-08-01&period_end=2026-08-31"
        )
      ).toBe(true)
    );
  });

  it("voltar para a visão geral não repete a busca do mesmo período", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await irPara(user, "DRE");
    await screen.findByText("RECEITAS");

    const antes = getMock.mock.calls.filter(([u]) =>
      (u as string).startsWith("/financial/dre")
    ).length;

    await user.click(screen.getByRole("tab", { name: "Visão Geral" }));
    await user.click(screen.getByRole("tab", { name: "DRE" }));

    expect(
      getMock.mock.calls.filter(([u]) =>
        (u as string).startsWith("/financial/dre")
      ).length
    ).toBe(antes);
  });
});

describe("FinanceiroPage — papéis", () => {
  it("secretário é mandado de volta ao dashboard", async () => {
    comPapeis(["secretary"]);

    render(<FinanceiroPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("sessão sem usuário resolvido não redireciona", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(<FinanceiroPage />);

    await screen.findByText("Visão geral e tesouraria");
    expect(replace).not.toHaveBeenCalled();
  });

  it("pastor não vê lançamentos, recorrentes, valores do DRE nem exportação", async () => {
    const user = userEvent.setup();
    comPapeis(["pastor"]);

    render(<FinanceiroPage />);
    await screen.findByText("Visão geral e tesouraria");

    expect(
      screen.queryByRole("tab", { name: "Lançamentos" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Recorrentes" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "DRE" }));
    await screen.findByText("RECEITAS");

    expect(screen.queryByText("Total")).not.toBeInTheDocument();
    expect(screen.queryByText("R$ 5.000,00")).not.toBeInTheDocument();
    expect(screen.queryByText(/^exportar:/)).not.toBeInTheDocument();
    // A coluna de valores sai da tabela inteira, inclusive das linhas de
    // categoria.
    expect(screen.queryByText("R$ 2.000,00")).not.toBeInTheDocument();
  });

  it("pastor com grupos vazios mantém o colSpan do aviso", async () => {
    const user = userEvent.setup();
    comPapeis(["pastor"]);
    rotear({
      dre: dre({
        revenue: { categories: [], total: 0 },
        expenses: { categories: [], total: 0 },
      }),
    });

    render(<FinanceiroPage />);
    await screen.findByText("Visão geral e tesouraria");
    await user.click(screen.getByRole("tab", { name: "DRE" }));

    const avisos = await screen.findAllByText("Sem lançamentos");
    expect(avisos[0].getAttribute("colspan")).toBe("3");
  });

  it("quem gerencia categorias abre o modal, e a mudança recarrega a lista", async () => {
    const user = userEvent.setup();
    render(<FinanceiroPage />);
    await screen.findByText("Visão geral e tesouraria");

    await user.click(screen.getByLabelText("Categorias"));
    expect(screen.getByText("categorias:aberto")).toBeInTheDocument();

    const chamadas = () =>
      getMock.mock.calls.filter(
        ([u]) => u === "/financial/transactions?limit=100"
      ).length;
    const antes = chamadas();

    await user.click(
      screen.getByRole("button", { name: "avisar categorias mudaram" })
    );

    await waitFor(() => expect(chamadas()).toBe(antes + 1));
  });

  it("quem não gerencia categorias não vê o botão nem o modal", async () => {
    comPapeis(["pastor"]);

    render(<FinanceiroPage />);

    await screen.findByText("Visão geral e tesouraria");
    expect(screen.queryByLabelText("Categorias")).not.toBeInTheDocument();
    expect(screen.queryByText(/^categorias:/)).not.toBeInTheDocument();
  });
});
