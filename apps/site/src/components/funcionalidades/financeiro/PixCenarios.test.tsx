import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PixCenarios } from "@/components/funcionalidades/financeiro/PixCenarios";

describe("PixCenarios", () => {
  it("anuncia a seção pelo título", () => {
    render(<PixCenarios />);
    expect(screen.getByRole("heading", { name: /Três formas de receber via PIX\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PixCenarios />);
    for (const texto of [
      "PIX por chave manual",
      "PIX dinâmico",
      "Dízimo recorrente",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
