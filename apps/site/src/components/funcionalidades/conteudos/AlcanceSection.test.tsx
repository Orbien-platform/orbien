import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlcanceSection } from "@/components/funcionalidades/conteudos/AlcanceSection";

describe("AlcanceSection", () => {
  it("anuncia a seção pelo título", () => {
    render(<AlcanceSection />);
    expect(screen.getByRole("heading", { name: /A mensagem certa para quem precisa ver\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<AlcanceSection />);
    for (const texto of [
      "Todos os membros",
      "Pequeno grupo",
      "Ministério ou cargo",
      "Comunicados gerais, convocações e avisos urgentes para toda a base.",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
