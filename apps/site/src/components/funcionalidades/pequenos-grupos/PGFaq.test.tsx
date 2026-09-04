import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PGFaq } from "@/components/funcionalidades/pequenos-grupos/PGFaq";

describe("PGFaq", () => {
  it("anuncia a seção pelo título", () => {
    render(<PGFaq />);
    expect(screen.getByRole("heading", { name: /Perguntas sobre pequenos grupos\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PGFaq />);
    for (const texto of [
      "Posso chamar de EBD, ministério ou discipulado em vez de célula?",
      "O líder precisa ter smartphone para usar?",
      "Quantos grupos posso criar?",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
