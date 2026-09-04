import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PGCapabilities } from "@/components/funcionalidades/pequenos-grupos/PGCapabilities";

describe("PGCapabilities", () => {
  it("anuncia a seção pelo título", () => {
    render(<PGCapabilities />);
    expect(screen.getByRole("heading", { name: /Tudo para o líder focar na reunião\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PGCapabilities />);
    for (const texto of [
      "Materiais agendados",
      "Registro de presença mobile",
      "Semáforo de saúde",
      "Sugestão de convite",
      "Terminologia configurável",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
