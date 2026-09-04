import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SemCnpjFaq } from "@/components/sem-cnpj/SemCnpjFaq";

describe("SemCnpjFaq", () => {
  it("anuncia a seção pelo título", () => {
    render(<SemCnpjFaq />);
    expect(screen.getByRole("heading", { name: /As perguntas que toda igreja sem CNPJ faz\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<SemCnpjFaq />);
    for (const texto of [
      "Por que não preciso de CNPJ pra usar o Starter?",
      "Como o membro faz a doação sem CNPJ?",
      "Quando formalizar, preciso recriar tudo?",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
