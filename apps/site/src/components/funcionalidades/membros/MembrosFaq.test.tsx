import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MembrosFaq } from "@/components/funcionalidades/membros/MembrosFaq";

describe("MembrosFaq", () => {
  it("anuncia a seção pelo título", () => {
    render(<MembrosFaq />);
    expect(screen.getByRole("heading", { name: /Perguntas sobre o módulo de membros\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<MembrosFaq />);
    for (const texto of [
      "Tem limite de membros e visitantes cadastrados?",
      "Como funciona o QR code de entrada?",
      "Posso importar minha lista atual de membros?",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
