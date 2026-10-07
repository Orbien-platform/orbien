import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CostCenterTrend, monthsTouched } from "./CostCenterTrend";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

const monthly = {
  period: { start: "2026-07-01", end: "2026-09-30" },
  months: ["2026-07", "2026-08", "2026-09"],
  series: [
    {
      cost_center_id: "cc1",
      name: "Missões",
      points: [
        { month: "2026-07", revenue_total: 500, expenses_total: 100, net_result: 400 },
        { month: "2026-08", revenue_total: 0, expenses_total: 0, net_result: 0 },
        { month: "2026-09", revenue_total: 100, expenses_total: 300, net_result: -200 },
      ],
    },
    {
      cost_center_id: null,
      name: "Sem centro de custo",
      points: [
        { month: "2026-07", revenue_total: 0, expenses_total: 50, net_result: -50 },
        { month: "2026-08", revenue_total: 0, expenses_total: 0, net_result: 0 },
        { month: "2026-09", revenue_total: 0, expenses_total: 0, net_result: 0 },
      ],
    },
  ],
};

function open() {
  fireEvent.click(screen.getByRole("button", { name: "Ver evolução mensal" }));
}

describe("monthsTouched", () => {
  it("conta meses de calendário tocados pelo período", () => {
    expect(monthsTouched("2026-09-01", "2026-09-30")).toBe(1);
    expect(monthsTouched("2026-07-15", "2026-09-02")).toBe(3);
    expect(monthsTouched("2024-01-01", "2026-12-31")).toBe(36);
    expect(monthsTouched("2024-01-01", "2027-01-01")).toBe(37);
  });

  it("data inválida ou vazia: null", () => {
    expect(monthsTouched("", "2026-09-30")).toBeNull();
  });
});

describe("CostCenterTrend", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não busca nada antes do clique, nem em StrictMode", () => {
    render(
      <StrictMode>
        <CostCenterTrend start="2026-07-01" end="2026-09-30" />
      </StrictMode>,
    );
    expect(api.get).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Ver evolução mensal" })).toBeInTheDocument();
  });

  it("ao clicar, pede /financial/balancete/monthly com o período, uma vez só em StrictMode", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: monthly });
    render(
      <StrictMode>
        <CostCenterTrend start="2026-07-01" end="2026-09-30" />
      </StrictMode>,
    );
    open();
    await screen.findByRole("img", { name: /^jul\/26/ });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/financial/balancete/monthly?period_start=2026-07-01&period_end=2026-09-30");
  });

  it("'Todos os centros' soma os centros mês a mês, com lucro e prejuízo por extenso", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: monthly });
    render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();

    expect(await screen.findByRole("img", { name: /^jul\/26: lucro R\$\s?350,00$/ })).toBeInTheDocument(); // 400 - 50
    expect(screen.getByRole("img", { name: /^ago\/26: zerado R\$\s?0,00$/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^set\/26: prejuízo -R\$\s?200,00$/ })).toBeInTheDocument();
  });

  it("escolher um centro mostra só o resultado dele", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: monthly });
    render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    await screen.findByRole("img", { name: /^jul\/26/ });

    fireEvent.change(screen.getByRole("combobox", { name: "Centro de custo da evolução" }), {
      target: { value: "__none__" },
    });

    expect(screen.getByRole("img", { name: /^jul\/26: prejuízo -R\$\s?50,00$/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^set\/26: zerado/ })).toBeInTheDocument();
  });

  it("lucro sobe da linha de zero (teal) e prejuízo desce (crimson), com altura proporcional ao maior mês", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: monthly });
    render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    fireEvent.change(await screen.findByRole("combobox", { name: "Centro de custo da evolução" }), {
      target: { value: "cc1" },
    });

    const jul = screen.getByRole("img", { name: /^jul\/26/ });
    const up = jul.querySelector<HTMLElement>(".bg-teal");
    expect(up?.style.height).toBe("100%"); // 400 é o maior módulo
    expect(jul.querySelector(".bg-crimson")).toBeNull();

    const set = screen.getByRole("img", { name: /^set\/26/ });
    const down = set.querySelector<HTMLElement>(".bg-crimson");
    expect(down?.style.height).toBe("50%"); // 200 / 400
    expect(set.querySelector(".bg-teal")).toBeNull();

    const ago = screen.getByRole("img", { name: /^ago\/26/ });
    expect(ago.querySelector(".bg-teal, .bg-crimson")).toBeNull();
  });

  it("mais de 36 meses: mostra a mensagem e não chama a API", () => {
    render(<CostCenterTrend start="2022-01-01" end="2026-09-30" />);
    open();
    expect(screen.getByRole("alert")).toHaveTextContent("Escolha um período de até 36 meses");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("exatamente 36 meses ainda busca", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...monthly, months: [], series: [] } });
    render(<CostCenterTrend start="2024-01-01" end="2026-12-31" />);
    open();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
  });

  it("sem lançamentos: 'Sem lançamentos no período'", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...monthly, series: [] } });
    render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    expect(await screen.findByText("Sem lançamentos no período")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("403: sem acesso, não gráfico vazio", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { status: 403 } });
    render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    expect(await screen.findByText("Você não tem acesso a Evolução mensal.")).toBeInTheDocument();
  });

  it("outro erro: mensagem de falha", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("boom"));
    render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    expect(await screen.findByText("Erro ao carregar a evolução mensal. Tente de novo.")).toBeInTheDocument();
  });

  it("ignora a resposta antiga quando o período muda no meio da requisição", async () => {
    let resolveOld!: (v: unknown) => void;
    const old = new Promise((r) => (resolveOld = r));
    const novo = {
      period: { start: "2026-08-01", end: "2026-09-30" },
      months: ["2026-08", "2026-09"],
      series: [
        {
          cost_center_id: "cc1",
          name: "Missões",
          points: [
            { month: "2026-08", revenue_total: 0, expenses_total: 0, net_result: 0 },
            { month: "2026-09", revenue_total: 10, expenses_total: 0, net_result: 10 },
          ],
        },
      ],
    };
    vi.mocked(api.get).mockImplementation((url: string) =>
      (url.includes("period_start=2026-08-01") ? Promise.resolve({ data: novo }) : old) as never,
    );
    const { rerender } = render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    rerender(<CostCenterTrend start="2026-08-01" end="2026-09-30" />);
    await screen.findByRole("img", { name: /^set\/26: lucro R\$\s?10,00$/ });

    await act(async () => {
      resolveOld({ data: monthly });
    });
    expect(screen.getByRole("img", { name: /^set\/26: lucro R\$\s?10,00$/ })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /^jul\/26/ })).not.toBeInTheDocument();
  });

  it("o centro escolhido que some do novo período volta para 'Todos os centros'", async () => {
    const semMissoes = {
      period: { start: "2026-08-01", end: "2026-09-30" },
      months: ["2026-08", "2026-09"],
      series: [
        {
          cost_center_id: "cc9",
          name: "Louvor",
          points: [
            { month: "2026-08", revenue_total: 0, expenses_total: 5, net_result: -5 },
            { month: "2026-09", revenue_total: 0, expenses_total: 0, net_result: 0 },
          ],
        },
      ],
    };
    vi.mocked(api.get).mockImplementation((url: string) =>
      Promise.resolve({ data: url.includes("period_start=2026-08-01") ? semMissoes : monthly }) as never,
    );
    const { rerender } = render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    const select = await screen.findByRole("combobox", { name: "Centro de custo da evolução" });
    fireEvent.change(select, { target: { value: "cc1" } });
    expect(select).toHaveValue("cc1");

    rerender(<CostCenterTrend start="2026-08-01" end="2026-09-30" />);

    await screen.findByRole("img", { name: /^ago\/26: prejuízo -R\$\s?5,00$/ });
    expect(screen.getByRole("combobox", { name: "Centro de custo da evolução" })).toHaveValue("__all__");
  });

  it("os meses continuam sendo itens de lista (listitem)", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: monthly });
    render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    await screen.findByRole("img", { name: /^jul\/26/ });
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("mudar o período com a evolução aberta busca de novo", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: monthly });
    const { rerender } = render(<CostCenterTrend start="2026-07-01" end="2026-09-30" />);
    open();
    await screen.findByRole("img", { name: /^jul\/26/ });

    rerender(<CostCenterTrend start="2026-08-01" end="2026-09-30" />);

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(within(document.body).getAllByRole("img").length).toBeGreaterThan(0);
  });
});
