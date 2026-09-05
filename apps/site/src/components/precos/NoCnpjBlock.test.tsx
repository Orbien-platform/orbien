import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoCnpjBlock } from "@/components/precos/NoCnpjBlock";

describe("NoCnpjBlock", () => {
  it("anuncia a seção pelo título", () => {
    render(<NoCnpjBlock />);
    expect(screen.getByRole("heading", { name: /Sua igreja ainda não tem CNPJ\?/ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<NoCnpjBlock />);
    expect(screen.getByText("Antes da formalização")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<NoCnpjBlock />);
    for (const texto of [
      "PIX cai direto na chave da igreja",
      "Orbien não toca no dinheiro",
      "Migração pro Premium em 15 min",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
