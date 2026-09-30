import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BalancetePanel } from "./BalancetePanel";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

const balancete = {
  period: { start: "2026-09-01", end: "2026-09-30" },
  lines: [
    { cost_center_id: "cc1", cost_center_name: "Missões", revenue_total: 1000, expenses_total: 200, net_result: 800, count: 3 },
    { cost_center_id: null, cost_center_name: "Sem centro de custo", revenue_total: 0, expenses_total: 150, net_result: -150, count: 1 },
  ],
  revenue_total: 1000,
  expenses_total: 350,
  net_result: 650,
};

describe("BalancetePanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lista uma linha por centro de custo e o total", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: balancete });
    render(<BalancetePanel />);

    expect(await screen.findByText("Missões")).toBeInTheDocument();
    expect(screen.getByText("Sem centro de custo")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?650,00/)).toBeInTheDocument();
    expect(String(vi.mocked(api.get).mock.calls[0][0])).toMatch(
      /^\/financial\/balancete\?period_start=\d{4}-\d{2}-\d{2}&period_end=\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("pede uma vez só, mesmo em StrictMode", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: balancete });
    render(
      <StrictMode>
        <BalancetePanel />
      </StrictMode>,
    );
    await screen.findByText("Missões");
    expect(vi.mocked(api.get)).toHaveBeenCalledTimes(1);
  });

  it("avisa quando o período não tem lançamentos", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...balancete, lines: [] } });
    render(<BalancetePanel />);
    expect(await screen.findByText("Sem lançamentos no período")).toBeInTheDocument();
  });

  it("mostra sem acesso no 403 (plano ou papel), sem fingir tabela vazia", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<BalancetePanel />);
    expect(await screen.findByText(/Você não tem acesso a Balancete/)).toBeInTheDocument();
    expect(screen.queryByText("Sem lançamentos no período")).not.toBeInTheDocument();
  });

  it("mostra erro em falha que não é 403", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    render(<BalancetePanel />);
    expect(await screen.findByText("Erro ao carregar o balancete. Tente de novo.")).toBeInTheDocument();
  });
});
