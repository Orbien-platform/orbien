import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SemCnpjHero } from "@/components/sem-cnpj/SemCnpjHero";

describe("SemCnpjHero", () => {
  it("anuncia a seção pelo título", () => {
    render(<SemCnpjHero />);
    expect(screen.getByRole("heading", { name: /Comece hoje\. Formalize depois\./ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<SemCnpjHero />);
    expect(screen.getByText("Para igrejas sem CNPJ")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<SemCnpjHero />);
    for (const texto of [
      "Este mês",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it("aponta \"Entrar na lista de espera\" para #waitlist", () => {
    render(<SemCnpjHero />);
    expect(screen.getByRole("link", { name: "Entrar na lista de espera" })).toHaveAttribute(
      "href",
      "#waitlist",
    );
  });

  it("aponta \"Ver plano Starter\" para /precos", () => {
    render(<SemCnpjHero />);
    expect(screen.getByRole("link", { name: "Ver plano Starter" })).toHaveAttribute(
      "href",
      "/precos",
    );
  });
});
