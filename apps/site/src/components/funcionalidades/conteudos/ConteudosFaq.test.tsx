import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConteudosFaq } from "@/components/funcionalidades/conteudos/ConteudosFaq";

describe("ConteudosFaq", () => {
  it("anuncia a seção pelo título", () => {
    render(<ConteudosFaq />);
    expect(screen.getByRole("heading", { name: /Perguntas sobre conteúdos e notificações\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<ConteudosFaq />);
    for (const texto of [
      "O membro precisa baixar algum app específico?",
      "Posso programar devocionais para o mês inteiro de uma vez?",
      "Consigo saber quantas pessoas leram o aviso?",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
