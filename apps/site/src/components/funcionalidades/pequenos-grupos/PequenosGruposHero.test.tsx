import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PequenosGruposHero } from "@/components/funcionalidades/pequenos-grupos/PequenosGruposHero";

describe("PequenosGruposHero", () => {
  it("traz o rótulo da seção", () => {
    render(<PequenosGruposHero />);
    expect(screen.getByText("Funcionalidades · Pequenos Grupos")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PequenosGruposHero />);
    for (const texto of [
      "Célula Alfa",
      "PG Jovens",
      "Célula Bética",
      "Célula Delta",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("aponta \"Entrar na lista de espera\" para #waitlist", () => {
    render(<PequenosGruposHero />);
    expect(screen.getByRole("link", { name: "Entrar na lista de espera" })).toHaveAttribute(
      "href",
      "#waitlist",
    );
  });

  it("aponta \"Ver todos os módulos\" para /funcionalidades", () => {
    render(<PequenosGruposHero />);
    expect(screen.getByRole("link", { name: "Ver todos os módulos" })).toHaveAttribute(
      "href",
      "/funcionalidades",
    );
  });
});
