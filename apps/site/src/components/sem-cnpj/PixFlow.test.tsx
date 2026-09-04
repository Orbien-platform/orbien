import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PixFlow } from "@/components/sem-cnpj/PixFlow";

describe("PixFlow", () => {
  it("anuncia a seção pelo título", () => {
    render(<PixFlow />);
    expect(screen.getByRole("heading", { name: /O dinheiro vai direto pra sua igreja\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PixFlow />);
    for (const texto of [
      "PIX cai direto na sua chave",
      "Recibo automático para o doador",
      "Orbien não é intermediária",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
