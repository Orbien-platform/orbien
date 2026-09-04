import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "@/components/sem-cnpj/HowItWorks";

describe("HowItWorks", () => {
  it("anuncia a seção pelo título", () => {
    render(<HowItWorks />);
    expect(screen.getByRole("heading", { name: /Três passos e sua igreja está no ar\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<HowItWorks />);
    for (const texto of [
      "Crie sua conta em 5 minutos",
      "Configure sua chave PIX",
      "Sua igreja já está no ar",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
