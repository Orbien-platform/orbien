import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContatoContent } from "./ContatoContent";

describe("ContatoContent", () => {
  it("abre a conversa direta, sem formulário", () => {
    render(<ContatoContent />);

    expect(screen.getByText("Contato")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Fale com a gente."
    );
    expect(
      screen.getByText(/Sem formulário, sem fila de suporte/)
    ).toBeInTheDocument();
    expect(document.querySelector("form")).toBeNull();
  });

  it("o botão do WhatsApp já leva a mensagem pronta", () => {
    render(<ContatoContent />);

    const whatsapp = screen.getByRole("link", {
      name: /Abrir conversa no WhatsApp/,
    });
    expect(whatsapp).toHaveAttribute(
      "href",
      "https://wa.me/5554999529683?text=Oi!%20Vim%20do%20site%20da%20Orbien%20e%20queria%20entender%20melhor%20como%20funciona%20pra%20minha%20igreja."
    );
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("mostra horário, praça e o convite para a demonstração", () => {
    render(<ContatoContent />);

    expect(screen.getByText("Segunda a sexta, 9h às 18h")).toBeInTheDocument();
    expect(screen.getByText("Passo Fundo, RS")).toBeInTheDocument();
    expect(
      screen.getByText("Prefere agendar uma demonstração?")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Agendar demo" })
    ).toBeInTheDocument();
  });
});
