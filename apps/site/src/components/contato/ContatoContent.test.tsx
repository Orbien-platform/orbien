import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContatoContent } from "@/components/contato/ContatoContent";

describe("ContatoContent", () => {
  it("anuncia a seção pelo título", () => {
    render(<ContatoContent />);
    expect(screen.getByRole("heading", { name: /Fale com a gente\./ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<ContatoContent />);
    expect(screen.getByText("Contato")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<ContatoContent />);
    for (const texto of [
      "Sem formulário, sem fila de suporte. Uma conversa direta pelo WhatsApp — a gente responde no mesmo dia.",
      "Segunda a sexta, 9h às 18h",
      "Passo Fundo, RS",
      "Prefere agendar uma demonstração?",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("aponta \"Abrir conversa no WhatsApp\" para https://wa.me/5554999529683?text=Oi!%20Vim%20do%20site%20da%20Orbien%20e%20queria%20entender%20melhor%20como%20funciona%20pra%20minha%20igreja.", () => {
    render(<ContatoContent />);
    expect(screen.getByRole("link", { name: "Abrir conversa no WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5554999529683?text=Oi!%20Vim%20do%20site%20da%20Orbien%20e%20queria%20entender%20melhor%20como%20funciona%20pra%20minha%20igreja.",
    );
  });

  it("aponta \"Agendar demo\" para #", () => {
    render(<ContatoContent />);
    expect(screen.getByRole("link", { name: "Agendar demo" })).toHaveAttribute(
      "href",
      "#",
    );
  });
});
