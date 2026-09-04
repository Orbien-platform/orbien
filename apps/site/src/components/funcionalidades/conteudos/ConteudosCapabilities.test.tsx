import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConteudosCapabilities } from "@/components/funcionalidades/conteudos/ConteudosCapabilities";

describe("ConteudosCapabilities", () => {
  it("anuncia a seção pelo título", () => {
    render(<ConteudosCapabilities />);
    expect(screen.getByRole("heading", { name: /Comunicação que a comunidade abre\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<ConteudosCapabilities />);
    for (const texto of [
      "Agenda de eventos",
      "Mensagem da liderança",
      "Segmentação de público",
      "Métricas de leitura",
      "Modo silencioso por horário",
      "Identidade visual da igreja",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
