import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LgpdContent } from "@/components/lgpd/LgpdContent";

describe("LgpdContent", () => {
  it("anuncia a seção pelo título", () => {
    render(<LgpdContent />);
    expect(screen.getByRole("heading", { name: /Política de Privacidade e LGPD/ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<LgpdContent />);
    expect(screen.getByText("Legal e privacidade")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<LgpdContent />);
    for (const texto of [
      "1. Controlador e Operador",
      "3. Bases legais para o tratamento",
      "4. Encarregado de Dados (DPO)",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("aponta \"privacidade@orbien.app\" para mailto:privacidade@orbien.app", () => {
    render(<LgpdContent />);
    const links = screen.getAllByRole("link", { name: "privacidade@orbien.app" });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "mailto:privacidade@orbien.app");
    }
  });
});
