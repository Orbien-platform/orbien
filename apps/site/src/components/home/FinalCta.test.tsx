import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinalCta } from "@/components/home/FinalCta";

describe("FinalCta", () => {
  it("anuncia a seção pelo título", () => {
    render(<FinalCta />);
    expect(screen.getByRole("heading", { name: /Pronto pra ver na sua igreja\?/ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<FinalCta />);
    expect(screen.getByText("Lista de espera aberta")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<FinalCta />);
    for (const texto of [
      "Entre na lista de espera e a gente te chama assim que abrir a primeira leva de igrejas-piloto.",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("aponta \"Entrar na lista de espera\" para #", () => {
    render(<FinalCta />);
    expect(screen.getByRole("link", { name: "Entrar na lista de espera" })).toHaveAttribute(
      "href",
      "#",
    );
  });

  it("aponta \"Prefere conversar antes? Fale no WhatsApp →\" para https://wa.me/5554999529683", () => {
    render(<FinalCta />);
    expect(screen.getByRole("link", { name: "Prefere conversar antes? Fale no WhatsApp →" })).toHaveAttribute(
      "href",
      "https://wa.me/5554999529683",
    );
  });
});
