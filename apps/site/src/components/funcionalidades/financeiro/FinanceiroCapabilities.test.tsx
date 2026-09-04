import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceiroCapabilities } from "@/components/funcionalidades/financeiro/FinanceiroCapabilities";

describe("FinanceiroCapabilities", () => {
  it("anuncia a seção pelo título", () => {
    render(<FinanceiroCapabilities />);
    expect(screen.getByRole("heading", { name: /Do recibo ao balanço anual\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<FinanceiroCapabilities />);
    for (const texto of [
      "Recibo automático",
      "Dashboard financeiro",
      "Relatório semanal automático",
      "DRE, fluxo de caixa e forecast",
      "Exportação contábil",
      "Carnê do dizimista",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
