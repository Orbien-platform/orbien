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

function weeklyResponse(overrides?: Partial<Record<string, unknown>>) {
  return {
    weekly: Array.from({ length: 8 }, (_, i) => ({
      week_start: `2026-0${i + 1}-01`,
      week_end: `2026-0${i + 1}-07`,
      income: 1000 + i,
      expense: 500,
      net: 500 + i,
    })),
    current_month: { income: 5000, expense: 2000, net: 3000, vs_last_month_pct: 12.5 },
    top_income_categories: [{ category_name: "Dízimo", total: 3000 }],
    average_per_contributor: 250,
    tithe_active_count: 12,
    ...overrides,
  };
}

describe("WeeklyDashboardCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows skeletons while loading", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    render(<WeeklyDashboardCard />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("renders the 3 KPIs and 8 weeks from the dedicated endpoint", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: weeklyResponse() });
    render(<WeeklyDashboardCard />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/weekly"));

    expect(await screen.findByText("Receitas")).toBeInTheDocument();
    expect(screen.getByText("Despesas")).toBeInTheDocument();
    expect(screen.getByText("Resultado")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?5\.000,00/)).toBeInTheDocument();
  });

  it("shows NoAccessState on 403", async () => {
    const forbiddenError = { response: { status: 403 } };
    vi.mocked(api.get).mockRejectedValue(forbiddenError);
    render(<WeeklyDashboardCard />);

    expect(await screen.findByText("Você não tem acesso a Financeiro.")).toBeInTheDocument();
  });

  it("shows the Resultado KPI in negative variant when net is below zero", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: weeklyResponse({ current_month: { income: 1000, expense: 4000, net: -3000, vs_last_month_pct: null } }),
    });
    render(<WeeklyDashboardCard />);

    expect(await screen.findByText(/-R\$\s?3\.000,00/)).toBeInTheDocument();
  });

  it("shows the empty-weeks state when there are no weeks in the response", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: weeklyResponse({ weekly: [] }) });
    render(<WeeklyDashboardCard />);

    expect(await screen.findByText("Sem lançamentos nas últimas 8 semanas.")).toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: weeklyResponse() });
    render(
      <StrictMode>
        <WeeklyDashboardCard />
      </StrictMode>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/weekly"));
    expect(
      vi.mocked(api.get).mock.calls.filter(([u]) => u === "/financial/dashboard/weekly").length
    ).toBe(1);
  });
});
