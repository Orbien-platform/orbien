import { render, renderHook, screen, waitFor, within, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DreCostCenterMatrix } from "./DreCostCenterMatrix";
import { useDreReport, type DreMatrix } from "./useDreReport";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

const matrix: DreMatrix = {
  period: { start: "2026-09-01", end: "2026-09-30" },
  columns: [
    { cost_center_id: "cc1", name: "Missões", revenue_total: 1000, expenses_total: 400, net_result: 600 },
    { cost_center_id: "cc2", name: "Louvor", revenue_total: 100, expenses_total: 350, net_result: -250 },
    { cost_center_id: null, name: "Sem centro de custo", revenue_total: 0, expenses_total: 0, net_result: 0 },
  ],
  revenue: [{ category_name: "Dízimos", cells: { cc1: 1000, cc2: 100, __none__: 0 }, total: 1100 }],
  expenses: [{ category_name: "Aluguel", cells: { cc1: 400, cc2: 350, __none__: 0 }, total: 750 }],
  totals: { revenue_total: 1100, expenses_total: 750, net_result: 350 },
};

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest("tr") as HTMLElement;
}

describe("DreCostCenterMatrix", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uma coluna por centro, mais 'Sem centro de custo' e 'Total'", () => {
    render(<DreCostCenterMatrix matrix={matrix} loading={false} accessDenied={false} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Categoria", "Missões", "Louvor", "Sem centro de custo", "Total"]);
  });

  it("cada coluna mostra Lucro, Prejuízo ou Zerado em texto, com valor e cor", () => {
    render(<DreCostCenterMatrix matrix={matrix} loading={false} accessDenied={false} />);
    const result = within(rowOf("Resultado"));
    const cells = result.getAllByRole("cell");

    expect(within(cells[1]).getByText("Lucro")).toHaveClass("text-teal");
    expect(within(cells[1]).getByText(/R\$\s?600,00/)).toHaveClass("text-teal");
    expect(within(cells[2]).getByText("Prejuízo")).toHaveClass("text-crimson");
    expect(within(cells[2]).getByText(/-R\$\s?250,00/)).toHaveClass("text-crimson");
    expect(within(cells[3]).getByText("Zerado")).not.toHaveClass("text-teal");
    // Total fecha com o resultado do DRE.
    expect(within(cells[4]).getByText("Lucro")).toBeInTheDocument();
    expect(within(cells[4]).getByText(/R\$\s?350,00/)).toBeInTheDocument();
  });

  it("valores por categoria em cada centro; célula sem lançamento mostra traço", () => {
    render(<DreCostCenterMatrix matrix={matrix} loading={false} accessDenied={false} />);
    const dizimos = within(rowOf("Dízimos")).getAllByRole("cell");
    expect(dizimos[1]).toHaveTextContent(/R\$\s?1\.000,00/);
    expect(dizimos[2]).toHaveTextContent(/R\$\s?100,00/);
    expect(dizimos[3]).toHaveTextContent("—");
    expect(dizimos[4]).toHaveTextContent(/R\$\s?1\.100,00/);
  });

  it("linhas de seção trazem os totais de receitas e de despesas por coluna", () => {
    render(<DreCostCenterMatrix matrix={matrix} loading={false} accessDenied={false} />);
    const receitas = within(rowOf("Total de receitas")).getAllByRole("cell");
    expect(receitas[1]).toHaveTextContent(/R\$\s?1\.000,00/);
    expect(receitas[4]).toHaveTextContent(/R\$\s?1\.100,00/);
    const despesas = within(rowOf("Total de despesas")).getAllByRole("cell");
    expect(despesas[2]).toHaveTextContent(/R\$\s?350,00/);
    expect(despesas[4]).toHaveTextContent(/R\$\s?750,00/);
  });

  it("rola na horizontal em tela estreita (contêiner com overflow-x-auto)", () => {
    render(<DreCostCenterMatrix matrix={matrix} loading={false} accessDenied={false} />);
    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
    expect(table).toHaveClass("min-w-max");
    expect(screen.getByRole("columnheader", { name: "Categoria" })).toHaveClass("sticky", "left-0");
  });

  it("sem colunas: 'Sem lançamentos no período'", () => {
    render(
      <DreCostCenterMatrix
        matrix={{ ...matrix, columns: [], revenue: [], expenses: [], totals: { revenue_total: 0, expenses_total: 0, net_result: 0 } }}
        loading={false}
        accessDenied={false}
      />,
    );
    expect(screen.getByText("Sem lançamentos no período")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("403: mostra sem acesso, não tabela vazia", () => {
    render(<DreCostCenterMatrix matrix={null} loading={false} accessDenied />);
    expect(screen.getByText("Você não tem acesso a DRE por centro de custo.")).toBeInTheDocument();
  });

  it("carregando: mostra skeleton; sem matriz e sem erro: não renderiza nada", () => {
    const { container, rerender } = render(<DreCostCenterMatrix matrix={null} loading accessDenied={false} />);
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    rerender(<DreCostCenterMatrix matrix={null} loading={false} accessDenied={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("useDreReport — matriz por centro", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockGet(opts: { matrix?: unknown; matrixError?: unknown } = {}) {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/financial/dre/by-cost-center")) {
        return (opts.matrixError ? Promise.reject(opts.matrixError) : Promise.resolve({ data: opts.matrix ?? matrix })) as never;
      }
      if (url.startsWith("/financial/dre")) return Promise.resolve({ data: { net_result: 0 } }) as never;
      return Promise.reject(new Error(`unexpected ${url}`));
    });
  }

  function matrixCalls(): string[] {
    return vi
      .mocked(api.get)
      .mock.calls.map((c) => String(c[0]))
      .filter((u) => u.startsWith("/financial/dre/by-cost-center"));
  }

  it("pede só com período e sem cost_center_id, e guarda a matriz", async () => {
    mockGet();
    const { result } = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(result.current.matrix).toEqual(matrix));
    expect(matrixCalls()[0]).toMatch(
      /^\/financial\/dre\/by-cost-center\?period_start=\d{4}-\d{2}-\d{2}&period_end=\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("trocar o centro não refaz a matriz; trocar o período refaz", async () => {
    mockGet();
    const { result } = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(matrixCalls().length).toBe(1));

    act(() => result.current.setCostCenterId("cc1"));
    await new Promise((r) => setTimeout(r, 10));
    expect(matrixCalls().length).toBe(1);

    act(() => result.current.setStart("2026-01-01"));
    await waitFor(() => expect(matrixCalls().length).toBe(2));
  });

  it("ignora a resposta antiga da matriz quando o período muda no meio da requisição", async () => {
    let resolveOld!: (v: unknown) => void;
    const old = new Promise((r) => (resolveOld = r));
    const novaMatriz = { ...matrix, totals: { revenue_total: 1, expenses_total: 2, net_result: -1 } };
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith("/financial/dre/by-cost-center")) {
        return (url.includes("period_start=2026-01-01") ? Promise.resolve({ data: novaMatriz }) : old) as never;
      }
      return Promise.resolve({ data: { net_result: 0 } }) as never;
    });
    const { result } = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(matrixCalls().length).toBe(1));

    act(() => result.current.setStart("2026-01-01"));
    await waitFor(() => expect(result.current.matrix?.totals.net_result).toBe(-1));

    await act(async () => {
      resolveOld({ data: matrix });
    });
    expect(result.current.matrix?.totals.net_result).toBe(-1);
  });

  it("pastor não busca a matriz", async () => {
    mockGet();
    renderHook(() => useDreReport(true, true));
    await new Promise((r) => setTimeout(r, 10));
    expect(matrixCalls()).toEqual([]);
  });

  it("aba inativa não busca a matriz", async () => {
    mockGet();
    renderHook(() => useDreReport(false, false));
    await new Promise((r) => setTimeout(r, 10));
    expect(matrixCalls()).toEqual([]);
  });

  it("resposta sem 'columns' não vira matriz", async () => {
    mockGet({ matrix: { net_result: 0 } });
    const { result } = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(result.current.matrixLoading).toBe(false));
    expect(result.current.matrix).toBeNull();
  });

  it("403 marca matrixDenied; outro erro apenas esconde a matriz", async () => {
    mockGet({ matrixError: { response: { status: 403 } } });
    const denied = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(denied.result.current.matrixDenied).toBe(true));

    mockGet({ matrixError: new Error("boom") });
    const failed = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(failed.result.current.matrixLoading).toBe(false));
    expect(failed.result.current.matrixDenied).toBe(false);
    expect(failed.result.current.matrix).toBeNull();
  });
});
