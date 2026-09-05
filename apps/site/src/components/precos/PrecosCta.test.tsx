import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrecosCta } from "@/components/precos/PrecosCta";

describe("PrecosCta", () => {
  it("anuncia a seção pelo título", () => {
    render(<PrecosCta />);
    expect(screen.getByRole("heading", { name: /Ainda em dúvida sobre qual plano serve\?/ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<PrecosCta />);
    expect(screen.getByText("Sem pressa")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PrecosCta />);
    for (const texto of [
      "Reservamos 30 minutos pra te mostrar a Orbien rodando, com o cenário da sua igreja em mente.",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("aponta \"Agendar demonstração\" para #", () => {
    render(<PrecosCta />);
    expect(screen.getByRole("link", { name: "Agendar demonstração" })).toHaveAttribute(
      "href",
      "#",
    );
  });

  it("aponta \"Prefere conversar agora? Fale no WhatsApp →\" para https://wa.me/5554999529683", () => {
    render(<PrecosCta />);
    expect(screen.getByRole("link", { name: "Prefere conversar agora? Fale no WhatsApp →" })).toHaveAttribute(
      "href",
      "https://wa.me/5554999529683",
    );
  });
});
