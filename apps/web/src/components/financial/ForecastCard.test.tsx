import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForecastCard } from "./ForecastCard";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

// recharts não renderiza de verdade em jsdom — mesmo padrão de
// `WeeklyDashboardCard.test.tsx`/`apps/web/src/app/(admin)/dashboard/page.test.tsx`.
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

function forecastResponse() {
  return {
    historical: [
      { month: "2026-06", total: 1000 },
      { month: "2026-07", total: 1200 },
    ],
    projected: [
      { month: "2026-08", projected: 1100 },
      { month: "2026-09", projected: 1100 },
    ],
    monthly_average: 1100,
    recurring_monthly: 200,
    months_of_history: 2,
  };
}

describe("ForecastCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a skeleton while loading", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    render(<ForecastCard />);
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("fetches with the default 6-month horizon and renders the averages", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: forecastResponse() });
    render(<ForecastCard />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/forecast/6"));
    expect(await screen.findByText(/Média mensal: R\$\s?1\.100,00/)).toBeInTheDocument();
    expect(screen.getByText(/Recorrente\/mês: R\$\s?200,00/)).toBeInTheDocument();
  });

  it("refetches when the horizon changes", async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockResolvedValue({ data: forecastResponse() });
    render(<ForecastCard />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/forecast/6"));

    await user.selectOptions(screen.getByRole("combobox"), "12");

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/forecast/12"));
  });

  it("shows NoAccessState on 403 (Starter tenant)", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<ForecastCard />);

    expect(await screen.findByText("Você não tem acesso a Forecast financeiro.")).toBeInTheDocument();
  });

  it("shows a generic load error (not 'dados insuficientes') on a non-403 failure", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("network down"));
    render(<ForecastCard />);

    expect(await screen.findByText("Erro ao carregar o forecast. Tente de novo.")).toBeInTheDocument();
    expect(screen.queryByText("Dados insuficientes para projetar.")).not.toBeInTheDocument();
  });

  it("shows 'dados insuficientes' when historical and projected come back empty", async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: { historical: [], projected: [], monthly_average: 0, recurring_monthly: 0, months_of_history: 0 },
    });
    render(<ForecastCard />);

    expect(await screen.findByText("Dados insuficientes para projetar.")).toBeInTheDocument();
  });

  it("ignora uma resposta atrasada de um horizonte anterior (corrida entre requisições)", async () => {
    const user = userEvent.setup();
    let resolveSix!: (v: { data: ReturnType<typeof forecastResponse> }) => void;
    const sixPromise = new Promise<{ data: ReturnType<typeof forecastResponse> }>((resolve) => {
      resolveSix = resolve;
    });
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/financial/dashboard/forecast/6") return sixPromise;
      return Promise.resolve({
        data: { ...forecastResponse(), monthly_average: 999, recurring_monthly: 999 },
      });
    });

    render(<ForecastCard />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/forecast/6"));

    await user.selectOptions(screen.getByRole("combobox"), "12");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/forecast/12"));
    expect(await screen.findByText(/Média mensal: R\$\s?999,00/)).toBeInTheDocument();

    // A resposta do horizonte de 6 meses (pedido antes do de 12) chega
    // depois — não pode sobrescrever o resultado do horizonte já trocado.
    resolveSix({ data: forecastResponse() });
    await Promise.resolve();
    expect(screen.getByText(/Média mensal: R\$\s?999,00/)).toBeInTheDocument();
  });

  it("ignora um erro atrasado de um horizonte anterior (corrida entre requisições)", async () => {
    const user = userEvent.setup();
    let rejectSix!: (err: unknown) => void;
    const sixPromise = new Promise((_resolve, reject) => {
      rejectSix = reject;
    });
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === "/financial/dashboard/forecast/6") return sixPromise;
      return Promise.resolve({ data: forecastResponse() });
    });

    render(<ForecastCard />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/forecast/6"));

    await user.selectOptions(screen.getByRole("combobox"), "12");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/forecast/12"));
    expect(await screen.findByText(/Média mensal: R\$\s?1\.100,00/)).toBeInTheDocument();

    // O erro do horizonte de 6 meses (pedido antes do de 12) chega depois —
    // não pode transformar a tela já carregada em NoAccessState.
    rejectSix({ response: { status: 403 } });
    await Promise.resolve();
    expect(screen.queryByText("Você não tem acesso a Forecast financeiro.")).not.toBeInTheDocument();
  });

  it("guarda contra a dupla invocação de efeito do StrictMode ao trocar de horizonte", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: forecastResponse() });
    render(
      <StrictMode>
        <ForecastCard />
      </StrictMode>
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/financial/dashboard/forecast/6"));
    expect(
      vi.mocked(api.get).mock.calls.filter(([u]) => u === "/financial/dashboard/forecast/6").length
    ).toBe(1);
  });
});
