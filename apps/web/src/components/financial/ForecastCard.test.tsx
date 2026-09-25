import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForecastCard } from "./ForecastCard";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

vi.mock("recharts", () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    BarChart: Passthrough,
    Bar: Passthrough,
    XAxis: Passthrough,
    YAxis: Passthrough,
    CartesianGrid: Passthrough,
    Tooltip: Passthrough,
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
});
