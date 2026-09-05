import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StarterIncludes } from "@/components/sem-cnpj/StarterIncludes";

describe("StarterIncludes", () => {
  it("anuncia a seção pelo título", () => {
    render(<StarterIncludes />);
    expect(screen.getByRole("heading", { name: /O que está incluído sem CNPJ\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<StarterIncludes />);
    for (const texto of [
      "Membros e visitantes",
      "Doações via PIX",
      "Pequenos grupos",
      "Avisos e devocionais",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
