import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpgradePath } from "@/components/sem-cnpj/UpgradePath";

describe("UpgradePath", () => {
  it("anuncia a seção pelo título", () => {
    render(<UpgradePath />);
    expect(screen.getByRole("heading", { name: /A formalização chegou\? A migração leva 15 minutos\./ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<UpgradePath />);
    expect(screen.getByText("Quando chegar o CNPJ")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<UpgradePath />);
    for (const texto of [
      "CNPJ registrado no cadastro da igreja",
      "Chave PIX migrada para o CNPJ",
      "Acesso ao plano Premium desbloqueado",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
