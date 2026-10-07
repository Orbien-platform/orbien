import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrePanel } from "./DrePanel";
import { useDreReport, type DreReport } from "./useDreReport";
import api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  isForbidden: (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 403,
}));

function dreWith(over: Partial<DreReport> = {}): DreReport {
  return {
    period: { start: "2026-09-01", end: "2026-09-30" },
    revenue: { categories: [{ category_name: "Dízimos", total: 1000, count: 4 }], total: 1000 },
    expenses: { categories: [{ category_name: "Aluguel", total: 400, count: 1 }], total: 400 },
    net_result: 600,
    previous_period: { period: { start: "", end: "" }, revenue_total: 0, expenses_total: 0, net_result: 0 },
    ...over,
  };
}

function mockGet(handlers: { dre?: (url: string) => Promise<unknown>; centers?: unknown }) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url.startsWith("/financial/cost-centers")) {
      return handlers.centers === undefined
        ? Promise.reject(new Error("sem centros"))
        : Promise.resolve({ data: handlers.centers });
    }
    if (url.startsWith("/financial/dre")) return (handlers.dre ?? (() => Promise.resolve({ data: dreWith() })))(url) as never;
    return Promise.reject(new Error(`unexpected ${url}`));
  });
}

function dreCalls(): string[] {
  return vi
    .mocked(api.get)
    .mock.calls.map((c) => String(c[0]))
    .filter((u) => u.startsWith("/financial/dre"));
}

/** Monta o painel ligado ao hook real, como a page faz. */
function Harness({ active = true, isPastor = false }: { active?: boolean; isPastor?: boolean }) {
  const model = useDreReport(active, isPastor);
  return <DrePanel model={model} isPastor={isPastor} />;
}

describe("DrePanel — lucro e prejuízo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("net_result > 0: rotula 'Lucro do período' com o valor, em teal", async () => {
    mockGet({ dre: () => Promise.resolve({ data: dreWith({ net_result: 600 }) }) });
    render(<Harness />);
    const label = await screen.findByText("Lucro do período");
    expect(label).toHaveClass("text-teal");
    expect(screen.getByText(/R\$\s?600,00/)).toHaveClass("text-teal");
  });

  it("net_result < 0: rotula 'Prejuízo do período' em crimson", async () => {
    mockGet({ dre: () => Promise.resolve({ data: dreWith({ net_result: -250 }) }) });
    render(<Harness />);
    const label = await screen.findByText("Prejuízo do período");
    expect(label).toHaveClass("text-crimson");
    expect(screen.getByText(/-R\$\s?250,00/)).toHaveClass("text-crimson");
  });

  it("net_result = 0: rotula 'Resultado zerado', sem teal nem crimson", async () => {
    mockGet({ dre: () => Promise.resolve({ data: dreWith({ net_result: 0 }) }) });
    render(<Harness />);
    const label = await screen.findByText("Resultado zerado");
    expect(label).not.toHaveClass("text-teal");
    expect(label).not.toHaveClass("text-crimson");
  });

  it("mostra 'A realizar' com receitas e despesas pendentes, sem mexer no resultado", async () => {
    mockGet({
      dre: () =>
        Promise.resolve({ data: dreWith({ net_result: 600, pending: { revenue_total: 300, expenses_total: 120 } }) }),
    });
    render(<Harness />);
    await screen.findByText("Lucro do período");
    expect(screen.getByText("A realizar")).toBeInTheDocument();
    expect(screen.getByText(/Receitas\s+R\$\s?300,00/)).toBeInTheDocument();
    expect(screen.getByText(/Despesas\s+R\$\s?120,00/)).toBeInTheDocument();
    // O resultado segue sendo o do servidor, sem somar o pendente.
    expect(screen.getByText(/R\$\s?600,00/)).toBeInTheDocument();
  });

  it("sem pendentes: não mostra a linha 'A realizar'", async () => {
    mockGet({
      dre: () => Promise.resolve({ data: dreWith({ pending: { revenue_total: 0, expenses_total: 0 } }) }),
    });
    render(<Harness />);
    await screen.findByText("Lucro do período");
    expect(screen.queryByText("A realizar")).not.toBeInTheDocument();
  });

  it("pastor: não vê rótulo de resultado, valores, 'A realizar' nem seletor de centro", async () => {
    mockGet({
      dre: () => Promise.resolve({ data: dreWith({ pending: { revenue_total: 300, expenses_total: 120 } }) }),
    });
    render(<Harness isPastor />);
    await screen.findByText("Dízimos");
    expect(screen.queryByText("Lucro do período")).not.toBeInTheDocument();
    expect(screen.queryByText("A realizar")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Centro de custo" })).not.toBeInTheDocument();
    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });
});

describe("DrePanel — filtro por centro de custo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("'Todos os centros' não envia cost_center_id", async () => {
    mockGet({ centers: [{ id: "cc1", name: "Missões" }] });
    render(<Harness />);
    await screen.findByText("Lucro do período");
    expect(dreCalls()[0]).toMatch(/^\/financial\/dre\?period_start=\d{4}-\d{2}-\d{2}&period_end=\d{4}-\d{2}-\d{2}$/);
  });

  it("escolher um centro pede o DRE com cost_center_id=<id>", async () => {
    mockGet({ centers: [{ id: "cc1", name: "Missões" }] });
    render(<Harness />);
    await screen.findByText("Lucro do período");
    await screen.findByRole("option", { name: "Missões" });

    fireEvent.change(screen.getByRole("combobox", { name: "Centro de custo" }), { target: { value: "cc1" } });

    await waitFor(() => expect(dreCalls().some((u) => u.endsWith("&cost_center_id=cc1"))).toBe(true));
  });

  it("'Lançamentos sem centro' envia cost_center_id=none", async () => {
    mockGet({ centers: [] });
    render(<Harness />);
    await screen.findByText("Lucro do período");

    fireEvent.change(screen.getByRole("combobox", { name: "Centro de custo" }), { target: { value: "none" } });

    await waitFor(() => expect(dreCalls().some((u) => u.endsWith("&cost_center_id=none"))).toBe(true));
  });

  it("voltar para 'Todos os centros' omite o parâmetro de novo", async () => {
    mockGet({ centers: [{ id: "cc1", name: "Missões" }] });
    render(<Harness />);
    await screen.findByText("Lucro do período");
    await screen.findByRole("option", { name: "Missões" });
    const select = screen.getByRole("combobox", { name: "Centro de custo" });

    fireEvent.change(select, { target: { value: "cc1" } });
    await waitFor(() => expect(dreCalls().length).toBe(2));
    fireEvent.change(select, { target: { value: "" } });

    await waitFor(() => expect(dreCalls().length).toBe(3));
    expect(dreCalls()[2]).not.toContain("cost_center_id");
  });

  it("falha ao listar centros não derruba o DRE", async () => {
    mockGet({}); // /financial/cost-centers rejeita
    render(<Harness />);
    expect(await screen.findByText("Lucro do período")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Todos os centros" })).toBeInTheDocument();
  });
});

describe("useDreReport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aba inativa não busca nada", () => {
    mockGet({});
    renderHook(() => useDreReport(false, false));
    expect(vi.mocked(api.get)).not.toHaveBeenCalled();
  });

  it("ignora a resposta antiga quando o centro muda no meio da requisição", async () => {
    let resolveFirst!: (v: unknown) => void;
    const first = new Promise((r) => (resolveFirst = r));
    mockGet({
      dre: (url) =>
        url.includes("cost_center_id=cc1")
          ? Promise.resolve({ data: dreWith({ net_result: -10 }) })
          : (first as Promise<unknown>),
    });
    const { result } = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(dreCalls().length).toBe(1));

    act(() => result.current.setCostCenterId("cc1"));
    await waitFor(() => expect(result.current.dre?.net_result).toBe(-10));

    await act(async () => {
      resolveFirst({ data: dreWith({ net_result: 999 }) });
    });
    expect(result.current.dre?.net_result).toBe(-10);
  });

  it("403 marca acesso negado em vez de fingir DRE vazio", async () => {
    mockGet({ dre: () => Promise.reject({ response: { status: 403 } }) });
    const { result } = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(result.current.accessDenied).toBe(true));
    expect(result.current.dre).toBeNull();
  });

  it("período com data apagada não chama a API", async () => {
    mockGet({});
    const { result } = renderHook(() => useDreReport(true, false));
    await waitFor(() => expect(dreCalls().length).toBe(1));

    act(() => result.current.setStart(""));
    await new Promise((r) => setTimeout(r, 10));
    expect(dreCalls().length).toBe(1);
  });
});

describe("DrePanel — sem acesso", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 mostra o estado de sem acesso", async () => {
    mockGet({ dre: () => Promise.reject({ response: { status: 403 } }) });
    render(<Harness />);
    expect(await screen.findByText("Você não tem acesso a DRE.")).toBeInTheDocument();
  });
});
