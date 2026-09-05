import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LiderMobile } from "@/components/funcionalidades/pequenos-grupos/LiderMobile";

describe("LiderMobile", () => {
  it("anuncia a seção pelo título", () => {
    render(<LiderMobile />);
    expect(screen.getByRole("heading", { name: /O líder registra no celular\. O pastor vê na hora\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<LiderMobile />);
    for (const texto of [
      "Líder registra presença",
      "Painel atualizado",
      "Notificação automática",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
