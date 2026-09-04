import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PorQueExistimos } from "@/components/sobre/PorQueExistimos";

describe("PorQueExistimos", () => {
  it("anuncia a seção pelo título", () => {
    render(<PorQueExistimos />);
    expect(screen.getByRole("heading", { name: /O mercado ignorou igrejas pequenas por tempo demais\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PorQueExistimos />);
    for (const texto of [
      "Caro demais para quem está começando",
      "Interface que afasta, não que ajuda",
      "Exige CNPJ onde não devia",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
