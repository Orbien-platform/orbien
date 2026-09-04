import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TierTable } from "@/components/precos/TierTable";

describe("TierTable", () => {
  it("anuncia a seção e a âncora #faixas", () => {
    const { container } = render(<TierTable />);
    expect(screen.getByText("A tabela")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preço por faixa de membros" })).toBeInTheDocument();
    expect(container.querySelector("section")).toHaveAttribute("id", "faixas");
  });

  it.each([
    ["Até 50 membros", "igrejas em formação"],
    ["51 a 150", "perfil mais comum"],
    ["151 a 300", "igrejas estabelecidas"],
    ["301 a 600", "multissite começando"],
    ["Acima de 600", "plano sob medida a partir de 500"],
  ])("mostra a faixa %s nos três layouts", (faixa, sub) => {
    render(<TierTable />);
    // Tabela desktop + card Starter + card Premium.
    expect(screen.getAllByText(faixa)).toHaveLength(3);
    expect(screen.getAllByText(sub)).toHaveLength(3);
  });

  it.each([
    ["59,90", "99,90"],
    ["89,90", "159,90"],
    ["159,90", "249,00"],
  ])("cobra %s no Starter e %s no Premium", (starter, premium) => {
    render(<TierTable />);
    expect(screen.getAllByText(starter).length).toBeGreaterThan(0);
    expect(screen.getAllByText(premium).length).toBeGreaterThan(0);
  });

  it("põe travessão onde o Starter não é oferecido", () => {
    render(<TierTable />);
    // 2 faixas sem Starter × (tabela desktop + card Starter).
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("destaca o Premium como o mais escolhido", () => {
    render(<TierTable />);
    expect(screen.getAllByText("Mais escolhido")).toHaveLength(2);
  });

  it("lista as ressalvas do preço", () => {
    render(<TierTable />);
    for (const nota of [
      "Starter não está disponível acima de 300 membros.",
      "10% de desconto no primeiro ano do Premium.",
      "Filial adicional: R$ 49,90 (Starter) / R$ 79,90 (Premium) por mês.",
    ]) {
      expect(screen.getByText(nota)).toBeInTheDocument();
    }
  });
});
