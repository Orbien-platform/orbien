import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SobreHero } from "@/components/sobre/SobreHero";

describe("SobreHero", () => {
  it("anuncia a seção pelo título", () => {
    render(<SobreHero />);
    expect(screen.getByRole("heading", { name: /Gestão que serve\. Igreja que cresce\./ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<SobreHero />);
    expect(screen.getByText("Sobre a Orbien")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<SobreHero />);
    for (const texto of [
      "Church Platform Ltda",
      "Passo Fundo · RS",
      "Em desenvolvimento ativo",
      "Fase piloto · 2026",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
