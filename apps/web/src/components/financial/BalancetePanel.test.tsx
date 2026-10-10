import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

  it("mostra os gráficos por centro de custo junto da tabela", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: balancete });
    render(<BalancetePanel />);

    await screen.findByText("Missões");
    expect(screen.getByRole("region", { name: "Receitas e despesas por centro" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Participação nas despesas" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Missões: receitas/ })).toBeInTheDocument();
  });

  it("os gráficos seguem a MESMA ordem das linhas da tabela", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: balancete });
    render(<BalancetePanel />);

    await screen.findByText("Missões");
    const nomesDaTabela = screen
      .getAllByRole("row")
      .slice(1, 3) // cabeçalho fora; as 2 linhas de centro (a de "Total" fica de fora)
      .map((r) => r.querySelector("td")?.textContent);
    expect(nomesDaTabela).toEqual(["Missões", "Sem centro de custo"]);

    const compare = within(screen.getByRole("region", { name: "Receitas e despesas por centro" }));
    const nomesDoGrafico = compare.getAllByRole("img").map((i) => i.getAttribute("aria-label")?.split(":")[0]);
    expect(nomesDoGrafico).toEqual(nomesDaTabela);
  });

  it("oferece a evolução mensal sem buscá-la antes do clique", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: balancete });
    render(<BalancetePanel />);

    await screen.findByText("Missões");
    expect(screen.getByRole("button", { name: "Ver evolução mensal" })).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.map((c) => String(c[0])).some((u) => u.includes("/monthly"))).toBe(false);
  });

  it("sem lançamentos: nenhum gráfico", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { ...balancete, lines: [], revenue_total: 0, expenses_total: 0, net_result: 0 } });
    render(<BalancetePanel />);

    await screen.findByText("Sem lançamentos no período");
    expect(screen.queryByRole("region", { name: "Receitas e despesas por centro" })).not.toBeInTheDocument();
  });

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

  it("pede de novo ao mudar o período", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: balancete });
    render(<BalancetePanel />);
    await screen.findByText("Missões");

    fireEvent.change(screen.getByLabelText("Início do período"), { target: { value: "2026-08-01" } });

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(String(vi.mocked(api.get).mock.calls[1][0])).toContain("period_start=2026-08-01");
  });

  it("volta ao convite quando uma das datas é apagada, sem chamar a API", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: balancete });
    render(<BalancetePanel />);
    await screen.findByText("Missões");

    fireEvent.change(screen.getByLabelText("Fim do período"), { target: { value: "" } });

    expect(await screen.findByText("Selecione um período para ver o balancete.")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("descarta a resposta de um período antigo que chega depois do novo", async () => {
    let resolveOld!: (v: unknown) => void;
    vi.mocked(api.get)
      .mockReturnValueOnce(new Promise((r) => { resolveOld = r; }) as never)
      .mockResolvedValueOnce({ data: balancete });
    render(<BalancetePanel />);
    fireEvent.change(screen.getByLabelText("Início do período"), { target: { value: "2026-08-01" } });
    await screen.findByText("Missões");

    resolveOld({ data: { ...balancete, lines: [{ ...balancete.lines[0], cost_center_name: "Antigo" }] } });
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText("Antigo")).not.toBeInTheDocument();
    expect(screen.getByText("Missões")).toBeInTheDocument();
  });

  it("descarta o erro de um período antigo que falha depois do novo", async () => {
    let rejectOld!: (e: unknown) => void;
    vi.mocked(api.get)
      .mockReturnValueOnce(new Promise((_, r) => { rejectOld = r; }) as never)
      .mockResolvedValueOnce({ data: balancete });
    render(<BalancetePanel />);
    fireEvent.change(screen.getByLabelText("Início do período"), { target: { value: "2026-08-01" } });
    await screen.findByText("Missões");

    rejectOld(new Error("tarde"));
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText("Erro ao carregar o balancete. Tente de novo.")).not.toBeInTheDocument();
    expect(screen.getByText("Missões")).toBeInTheDocument();
  });
});
