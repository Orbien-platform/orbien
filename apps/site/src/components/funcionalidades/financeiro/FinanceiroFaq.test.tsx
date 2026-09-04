import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceiroFaq } from "@/components/funcionalidades/financeiro/FinanceiroFaq";

describe("FinanceiroFaq", () => {
  it("anuncia a seção pelo título", () => {
    render(<FinanceiroFaq />);
    expect(screen.getByRole("heading", { name: /Perguntas sobre o módulo financeiro\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<FinanceiroFaq />);
    for (const texto of [
      "Quanto a Orbien cobra sobre as doações?",
      "O doador recebe comprovante automático?",
      "Posso exportar para o meu contador?",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
