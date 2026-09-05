import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FinanceiroHero } from "@/components/funcionalidades/financeiro/FinanceiroHero";

describe("FinanceiroHero", () => {
  it("traz o rótulo da seção", () => {
    render(<FinanceiroHero />);
    expect(screen.getByText("Funcionalidades · Financeiro")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<FinanceiroHero />);
    for (const texto of [
      "Arrecadação",
      "Dizimistas",
      "Marina R.",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("aponta \"Entrar na lista de espera\" para #waitlist", () => {
    render(<FinanceiroHero />);
    expect(screen.getByRole("link", { name: "Entrar na lista de espera" })).toHaveAttribute(
      "href",
      "#waitlist",
    );
  });

  it("aponta \"Ver planos\" para /precos", () => {
    render(<FinanceiroHero />);
    expect(screen.getByRole("link", { name: "Ver planos" })).toHaveAttribute(
      "href",
      "/precos",
    );
  });

  it("pinta os três deltas do mockup em verde", () => {
    render(<FinanceiroHero />);
    for (const delta of ["+14%", "meta 70%", "+3 vs mês ant."]) {
      expect(screen.getByText(delta)).toHaveStyle({ color: "#00B8A2" });
    }
  });
});
