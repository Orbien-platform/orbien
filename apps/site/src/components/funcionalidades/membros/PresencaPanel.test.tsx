import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PresencaPanel } from "@/components/funcionalidades/membros/PresencaPanel";

describe("PresencaPanel", () => {
  it("anuncia a seção pelo título", () => {
    render(<PresencaPanel />);
    expect(screen.getByRole("heading", { name: /Nenhum visitante some sem que a liderança saiba\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PresencaPanel />);
    for (const texto of [
      "Carlos Mendes",
      "Patrícia Lemos",
      "Rodrigo Figueira",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
