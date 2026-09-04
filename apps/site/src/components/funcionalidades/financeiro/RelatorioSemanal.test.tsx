import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RelatorioSemanal } from "@/components/funcionalidades/financeiro/RelatorioSemanal";

describe("RelatorioSemanal", () => {
  it("anuncia a seção pelo título", () => {
    render(<RelatorioSemanal />);
    expect(screen.getByRole("heading", { name: /A tesoureira abre a segunda-feira e já tem tudo\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<RelatorioSemanal />);
    for (const texto of [
      "Total arrecadado",
      "Doadores únicos",
      "Dizimistas ativos",
      "Maior doação",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
