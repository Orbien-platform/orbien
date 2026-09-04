import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaqSection } from "@/components/home/FaqSection";

describe("FaqSection", () => {
  it("anuncia a seção pelo título", () => {
    render(<FaqSection />);
    expect(screen.getByRole("heading", { name: /Perguntas que a gente sempre ouve\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<FaqSection />);
    for (const texto of [
      "A Orbien funciona pra qualquer denominação?",
      "Preciso ter CNPJ pra usar?",
      "Tem trial gratuito?",
      "Onde os dados ficam guardados?",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
