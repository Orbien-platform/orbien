import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MembrosHero } from "@/components/funcionalidades/membros/MembrosHero";

describe("MembrosHero", () => {
  it("traz o rótulo da seção", () => {
    render(<MembrosHero />);
    expect(screen.getByText("Funcionalidades · Membros")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<MembrosHero />);
    for (const texto of [
      "Marina Rodrigues",
      "João Pedro Souza",
      "Ana Beatriz Lima",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("aponta \"Entrar na lista de espera\" para #waitlist", () => {
    render(<MembrosHero />);
    expect(screen.getByRole("link", { name: "Entrar na lista de espera" })).toHaveAttribute(
      "href",
      "#waitlist",
    );
  });

  it("aponta \"Ver todos os módulos\" para /funcionalidades", () => {
    render(<MembrosHero />);
    expect(screen.getByRole("link", { name: "Ver todos os módulos" })).toHaveAttribute(
      "href",
      "/funcionalidades",
    );
  });
});
