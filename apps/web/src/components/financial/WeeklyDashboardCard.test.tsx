import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WeeklyDashboardCard } from "./WeeklyDashboardCard";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

// recharts não renderiza de verdade em jsdom (ResponsiveContainer depende de
// ResizeObserver, que jsdom não implementa) — mesmo padrão de mock de
// `apps/web/src/app/(admin)/dashboard/page.test.tsx`. `tickFormatter` e
// `formatter` são código real do componente (decidem o texto do
// eixo/tooltip) — os stubs os invocam para exercitar essas closures.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Tooltip: ({ formatter }: { formatter?: (value: any) => React.ReactNode }) =>
      formatter ? <div>{formatter(100)}</div> : null,
    ResponsiveContainer: Passthrough,
  };
});

const OCT = { mode: "month" as const, start: "2026-10-01", end: "2026-10-31" };

function weeklyResponse(overrides?: Partial<Record<string, unknown>>) {
  return {
    period: { start: "2026-10-01", end: "2026-10-31", granularity: "week" },
    series: Array.from({ length: 5 }, (_, i) => ({
      start: `2026-10-${String(i * 7 + 1).padStart(2, "0")}`,
      end: `2026-10-${String(i * 7 + 7).padStart(2, "0")}`,
      income: 1000 + i,
      expense: 500,
      net: 500 + i,
    })),
    totals: { income: 5000, expense: 2000, net: 3000, vs_previous_pct: 12.5 },
    top_income_categories: [{ category_name: "Dízimo", total: 3000 }],
    average_per_contributor: 250,
    tithe_active_count: 12,
    ...overrides,
  };
}

const URL_OCT = "/financial/dashboard/weekly?period_start=2026-10-01&period_end=2026-10-31";

describe("WeeklyDashboardCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeletons while loading", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    render(<WeeklyDashboardCard period={OCT} />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("renders the 3 KPIs from the dedicated endpoint, asking for the chosen period", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: weeklyResponse() });
    render(<WeeklyDashboardCard period={OCT} />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(URL_OCT));

    expect(await screen.findByText("Receitas")).toBeInTheDocument();
    expect(screen.getByText("Despesas")).toBeInTheDocument();
    expect(screen.getByText("Resultado")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?5\.000,00/)).toBeInTheDocument();
  });

  it("shows NoAccessState on 403", async () => {
    const forbiddenError = { response: { status: 403 } };
    vi.mocked(api.get).mockRejectedValue(forbiddenError);
    render(<WeeklyDashboardCard period={OCT} />);

    expect(await screen.findByText("Você não tem acesso a Financeiro.")).toBeInTheDocument();
  });

  it("shows a generic load error (not the empty state) on a non-403 failure", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network down"));
    render(<WeeklyDashboardCard period={OCT} />);

    expect(
      await screen.findByText("Erro ao carregar o dashboard semanal. Tente de novo.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Sem lançamentos neste período.")).not.toBeInTheDocument();
  });

  it("shows the Resultado KPI in negative variant when net is below zero", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: weeklyResponse({ totals: { income: 1000, expense: 4000, net: -3000, vs_previous_pct: null } }),
    });
    render(<WeeklyDashboardCard period={OCT} />);

    expect(await screen.findByText(/-R\$\s?3\.000,00/)).toBeInTheDocument();
  });

  it("shows the empty state when no bucket of the period has movement", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: weeklyResponse({
        series: [{ start: "2026-10-01", end: "2026-10-31", income: 0, expense: 0, net: 0 }],
      }),
    });
    render(<WeeklyDashboardCard period={OCT} />);

    expect(await screen.findByText("Sem lançamentos neste período.")).toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: weeklyResponse() });
    render(
      <StrictMode>
        <WeeklyDashboardCard period={OCT} />
      </StrictMode>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(URL_OCT));
    expect(
      vi.mocked(api.get).mock.calls.filter(([u]) => u === URL_OCT).length
    ).toBe(1);
  });

  it("refaz a busca quando o período muda e usa a granularidade devolvida", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: weeklyResponse() });
    const { rerender } = render(<WeeklyDashboardCard period={OCT} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(URL_OCT));
    expect(await screen.findByText("Entradas e saídas por semana")).toBeInTheDocument();

    vi.mocked(api.get).mockResolvedValue({
      data: weeklyResponse({ period: { start: "2026-01-01", end: "2026-12-31", granularity: "month" } }),
    });
    rerender(<WeeklyDashboardCard period={{ mode: "year", start: "2026-01-01", end: "2026-12-31" }} />);

    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith(
        "/financial/dashboard/weekly?period_start=2026-01-01&period_end=2026-12-31"
      )
    );
    expect(await screen.findByText("Entradas e saídas por mês")).toBeInTheDocument();
  });

  it("ignora a resposta de um período que já foi trocado", async () => {
    let resolveFirst!: (v: unknown) => void;
    vi.mocked(api.get)
      .mockReturnValueOnce(new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValueOnce({
        data: weeklyResponse({ totals: { income: 777, expense: 0, net: 777, vs_previous_pct: null } }),
      });

    const { rerender } = render(<WeeklyDashboardCard period={OCT} />);
    rerender(<WeeklyDashboardCard period={{ mode: "month", start: "2026-11-01", end: "2026-11-30" }} />);
    expect((await screen.findAllByText(/R\$\s?777,00/)).length).toBeGreaterThan(0);

    resolveFirst({ data: weeklyResponse() });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText(/R\$\s?5\.000,00/)).not.toBeInTheDocument();
  });

  it("não busca enquanto o intervalo personalizado está incompleto", () => {
    vi.mocked(api.get).mockResolvedValue({ data: weeklyResponse() });
    render(<WeeklyDashboardCard period={{ mode: "custom", start: "2026-10-20", end: "2026-10-10" }} />);
    expect(api.get).not.toHaveBeenCalled();
  });
});
