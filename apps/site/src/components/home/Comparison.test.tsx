import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Comparison } from "@/components/home/Comparison";

describe("Comparison", () => {
  it("anuncia a seção pelo título e pelo rótulo", () => {
    render(<Comparison />);
    expect(screen.getByText("Comparativo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Por que igrejas que tentaram outros sistemas ficam\./ })
    ).toBeInTheDocument();
  });

  it("fixa a âncora usada pelo link do rodapé", () => {
    const { container } = render(<Comparison />);
    expect(container.querySelector("section")).toHaveAttribute("id", "comparativo");
  });

  it("nomeia as duas colunas comparadas", () => {
    render(<Comparison />);
    expect(screen.getByText("Outros sistemas")).toBeInTheDocument();
    expect(screen.getByText("Orbien")).toBeInTheDocument();
  });

  it.each([
    ["Exige CNPJ", "Sim", "Não"],
    ["App nas lojas", "Só nos planos caros", "Starter já tem"],
    ["PIX com recibo automático", "Plano alto", "Starter já tem"],
    ["UX", "Datada", "Mobile-first"],
    ["Tempo pra começar", "Dias", "5 minutos"],
  ])("compara %s", (feature, outros, nossa) => {
    render(<Comparison />);
    // Cada linha aparece duas vezes: a grade de desktop e a pilha mobile.
    expect(screen.getAllByText(feature)).toHaveLength(2);
    expect(screen.getAllByText(new RegExp(outros)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(nossa)).length).toBeGreaterThan(0);
  });

  it("marca cada linha com um ✗ para os outros e um ✓ para a Orbien", () => {
    const { container } = render(<Comparison />);
    // 5 linhas × 2 layouts (desktop e mobile) = 10 de cada ícone.
    const crimson = container.querySelectorAll('[style*="--crimson-dim"]');
    const teal = container.querySelectorAll('[style*="--teal-dim"]');
    expect(crimson).toHaveLength(10);
    expect(teal).toHaveLength(10);
  });
});
