import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "@/components/layout/Footer";

describe("Footer", () => {
  it("mostra as três colunas de links", () => {
    render(<Footer />);
    expect(screen.getByText("Produto")).toBeInTheDocument();
    expect(screen.getByText("Empresa")).toBeInTheDocument();
    expect(screen.getByText("Legal e segurança")).toBeInTheDocument();
  });

  it.each([
    ["Funcionalidades", "/funcionalidades"],
    ["Preços", "/precos"],
    ["Comparativo", "/funcionalidades#comparativo"],
    ["Roadmap", "/roadmap"],
    ["Mudanças", "/mudancas"],
    ["Sobre", "/sobre"],
    ["Pastores parceiros", "/pastores-parceiros"],
    ["Contato", "/contato"],
    ["WhatsApp", "https://wa.me/5554999529683"],
    ["Termos de uso", "/termos"],
    ["Política de privacidade", "/privacidade"],
    ["LGPD", "/lgpd"],
    ["Status", "/status"],
  ])("aponta %s para %s", (label, href) => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });

  it("rotula os ícones sociais para leitor de tela", () => {
    render(<Footer />);
    for (const label of ["Instagram", "YouTube", "LinkedIn"]) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", "#");
    }
  });

  it("assina o rodapé com o ano corrente", () => {
    render(<Footer />);
    const ano = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${ano} Church Platform Ltda`))).toBeInTheDocument();
    expect(screen.getByText("orbien.app")).toBeInTheDocument();
  });
});
