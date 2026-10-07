import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CostCenterCharts, sharesOf, type CostCenterChartLine } from "./CostCenterCharts";

const lines: CostCenterChartLine[] = [
  { cost_center_id: "cc1", cost_center_name: "Missões", revenue_total: 1000, expenses_total: 200, net_result: 800 },
  { cost_center_id: "cc2", cost_center_name: "Louvor", revenue_total: 100, expenses_total: 600, net_result: -500 },
  { cost_center_id: null, cost_center_name: "Sem centro de custo", revenue_total: 0, expenses_total: 200, net_result: -200 },
];

function widthOf(el: Element | null): string {
  return (el as HTMLElement).style.width;
}

describe("sharesOf", () => {
  it("a soma dos percentuais é sempre 100, mesmo quando cada fatia isolada arredondaria para 99", () => {
    const shares = sharesOf([1, 1, 1]);
    expect(shares.reduce((s, v) => s + v, 0)).toBe(100);
    expect([...shares].sort()).toEqual([33, 33, 34]);
  });

  it("40%, 40% e 20% ficam exatos", () => {
    expect(sharesOf([200, 200, 100])).toEqual([40, 40, 20]);
  });

  it("sem despesas (soma zero) devolve zeros, sem NaN", () => {
    expect(sharesOf([0, 0])).toEqual([0, 0]);
    expect(sharesOf([])).toEqual([]);
  });
});

describe("CostCenterCharts — receitas e despesas por centro", () => {
  it("uma barra por centro, na ordem recebida (a da tabela), com aria-label por extenso", () => {
    render(<CostCenterCharts lines={lines} />);
    const compare = within(screen.getByRole("region", { name: "Receitas e despesas por centro" }));
    const items = compare.getAllByRole("img");
    expect(items.map((i) => i.getAttribute("aria-label"))).toEqual([
      expect.stringMatching(/^Missões: receitas R\$\s?1\.000,00, despesas R\$\s?200,00$/),
      expect.stringMatching(/^Louvor: receitas R\$\s?100,00, despesas R\$\s?600,00$/),
      expect.stringMatching(/^Sem centro de custo: receitas R\$\s?0,00, despesas R\$\s?200,00$/),
    ]);
  });

  it("as listas mantêm a semântica de lista: um listitem por centro em cada gráfico", () => {
    render(<CostCenterCharts lines={lines} />);
    const compare = within(screen.getByRole("region", { name: "Receitas e despesas por centro" }));
    const share = within(screen.getByRole("region", { name: "Participação nas despesas" }));
    expect(compare.getAllByRole("listitem")).toHaveLength(3);
    expect(share.getAllByRole("listitem")).toHaveLength(3);
  });

  it("largura proporcional ao maior valor de todos os centros (1000 = 100%)", () => {
    render(<CostCenterCharts lines={lines} />);
    const missoes = screen.getByRole("img", { name: /^Missões: receitas/ });
    const bars = missoes.querySelectorAll<HTMLElement>("div.h-full");
    expect(widthOf(bars[0])).toBe("100%"); // receitas 1000
    expect(widthOf(bars[1])).toBe("20%"); // despesas 200
  });

  it("o valor e o resultado ficam escritos, sem depender de cor", () => {
    render(<CostCenterCharts lines={lines} />);
    expect(screen.getByText(/^Missões: lucro R\$\s?800,00$/)).toBeInTheDocument();
    expect(screen.getByText(/^Louvor: prejuízo R\$\s?500,00$/)).toBeInTheDocument();
    expect(screen.getByText(/^Receitas R\$\s?1\.000,00$/)).toBeInTheDocument();
  });

  it("centro com resultado zero diz 'resultado zerado'", () => {
    render(
      <CostCenterCharts
        lines={[
          { cost_center_id: "a", cost_center_name: "Zero", revenue_total: 50, expenses_total: 50, net_result: 0 },
        ]}
      />,
    );
    expect(screen.getByText("Zero: resultado zerado")).toBeInTheDocument();
  });
});

describe("CostCenterCharts — participação nas despesas", () => {
  it("ordena por despesa e a soma dos percentuais é 100", () => {
    render(<CostCenterCharts lines={lines} />);
    const share = within(screen.getByRole("region", { name: "Participação nas despesas" }));
    const labels = share.getAllByRole("img").map((i) => i.getAttribute("aria-label") ?? "");
    expect(labels[0]).toMatch(/^Louvor: 60% das despesas, R\$\s?600,00$/);
    const percents = labels.map((l) => Number(/(\d+)% das despesas/.exec(l)?.[1]));
    expect(percents.reduce((s, v) => s + v, 0)).toBe(100);
  });

  it("a barra tem a largura do percentual", () => {
    render(<CostCenterCharts lines={lines} />);
    const louvor = screen.getByRole("img", { name: /^Louvor: 60% das despesas/ });
    expect(widthOf(louvor.querySelector("div.h-full"))).toBe("60%");
  });

  it("centro sem despesa não aparece na participação", () => {
    render(
      <CostCenterCharts
        lines={[
          { cost_center_id: "a", cost_center_name: "Só receita", revenue_total: 100, expenses_total: 0, net_result: 100 },
          { cost_center_id: "b", cost_center_name: "Com despesa", revenue_total: 0, expenses_total: 40, net_result: -40 },
        ]}
      />,
    );
    const share = within(screen.getByRole("region", { name: "Participação nas despesas" }));
    expect(share.getAllByRole("img")).toHaveLength(1);
    expect(share.queryByText(/Só receita/)).not.toBeInTheDocument();
  });

  it("sem nenhuma despesa: some o bloco de participação, a comparação fica", () => {
    render(
      <CostCenterCharts
        lines={[{ cost_center_id: "a", cost_center_name: "A", revenue_total: 100, expenses_total: 0, net_result: 100 }]}
      />,
    );
    expect(screen.queryByRole("region", { name: "Participação nas despesas" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Receitas e despesas por centro" })).toBeInTheDocument();
  });
});

describe("CostCenterCharts — vazio", () => {
  it("sem linhas ou com tudo zerado: não renderiza nada", () => {
    const { container, rerender } = render(<CostCenterCharts lines={[]} />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <CostCenterCharts
        lines={[{ cost_center_id: "a", cost_center_name: "A", revenue_total: 0, expenses_total: 0, net_result: 0 }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
