import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Credibility } from "@/components/home/Credibility";

describe("Credibility", () => {
  it("mostra o conteúdo da seção", () => {
    render(<Credibility />);
    for (const texto of [
      "Feito com pastores, para pastores.",
      "Em desenvolvimento com igrejas de Passo Fundo · RS",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
