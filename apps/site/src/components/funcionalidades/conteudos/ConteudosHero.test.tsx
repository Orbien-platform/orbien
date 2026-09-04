import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConteudosHero } from "@/components/funcionalidades/conteudos/ConteudosHero";

describe("ConteudosHero", () => {
  it("traz o rótulo da seção", () => {
    render(<ConteudosHero />);
    expect(screen.getByText("Funcionalidades · Conteúdos")).toBeInTheDocument();
  });

  it("aponta \"Entrar na lista de espera\" para #waitlist", () => {
    render(<ConteudosHero />);
    expect(screen.getByRole("link", { name: "Entrar na lista de espera" })).toHaveAttribute(
      "href",
      "#waitlist",
    );
  });

  it("aponta \"Ver todos os módulos\" para /funcionalidades", () => {
    render(<ConteudosHero />);
    expect(screen.getByRole("link", { name: "Ver todos os módulos" })).toHaveAttribute(
      "href",
      "/funcionalidades",
    );
  });
});
