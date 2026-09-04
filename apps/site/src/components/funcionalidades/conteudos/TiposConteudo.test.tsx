import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TiposConteudo } from "@/components/funcionalidades/conteudos/TiposConteudo";

describe("TiposConteudo", () => {
  it("anuncia a seção pelo título", () => {
    render(<TiposConteudo />);
    expect(screen.getByRole("heading", { name: /Três canais\. Uma só plataforma\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<TiposConteudo />);
    for (const texto of [
      "Comunicados e avisos",
      "Devocionais diários",
      "Pedidos de oração",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
