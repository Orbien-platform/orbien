import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrecosFaq } from "@/components/precos/PrecosFaq";

describe("PrecosFaq", () => {
  it("anuncia a seção pelo título", () => {
    render(<PrecosFaq />);
    expect(screen.getByRole("heading", { name: /Perguntas sobre preço e contrato/ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PrecosFaq />);
    for (const texto of [
      "Posso começar no Starter e migrar pro Premium depois?",
      "Tem fidelidade?",
      "Posso pagar anualmente com desconto?",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
