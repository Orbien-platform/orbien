import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstagioAtual } from "@/components/sobre/EstagioAtual";

describe("EstagioAtual", () => {
  it("anuncia a seção pelo título", () => {
    render(<EstagioAtual />);
    expect(screen.getByRole("heading", { name: /Estamos em fase piloto — e somos transparentes sobre isso\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<EstagioAtual />);
    for (const texto of [
      "Fundação e arquitetura do produto",
      "Design system Precision Modern finalizado",
      "Módulos de membros e finanças em piloto",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
