import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SemaforoSaude } from "@/components/funcionalidades/pequenos-grupos/SemaforoSaude";

describe("SemaforoSaude", () => {
  it("anuncia a seção pelo título", () => {
    render(<SemaforoSaude />);
    expect(screen.getByRole("heading", { name: /O pastor sabe qual grupo está esfriando\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<SemaforoSaude />);
    for (const texto of [
      "Verde — Saudável",
      "Amarelo — Atenção",
      "Vermelho — Inativo",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
