import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Home, { metadata } from "./page";

describe("Home", () => {
  it("renderiza o header, o footer e a chamada principal", () => {
    render(<Home />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /A plataforma de gestão que cabe na sua igreja\./,
      }),
    ).toBeInTheDocument();
  });

  it("monta as nove seções da home na ordem esperada", () => {
    render(<Home />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "Três motivos para a sua igreja começar hoje.",
      "O dia a dia, simplificado.",
      "Por que igrejas que tentaram outros sistemas ficam.",
      "Dois planos. O preço cresce com a sua igreja.",
      "Perguntas que a gente sempre ouve.",
      "Pronto pra ver na sua igreja?",
    ]);
  });

  it("aponta o CTA do hero para a âncora de lista de espera", () => {
    render(<Home />);

    const [hero] = within(screen.getByRole("main")).getAllByRole("link", {
      name: /lista de espera/i,
    });

    expect(hero).toHaveAttribute("href", "#waitlist");
  });

  it("mantém o CTA final como placeholder enquanto a waitlist não existe", () => {
    render(<Home />);

    // `FinalCta` ainda não foi ligado à âncora — divergência conhecida
    // entre os CTAs do site (ver o TODO em cada componente de CTA).
    // Quando a ação de waitlist for ligada, este teste falha e cobra a
    // atualização.
    const ctas = within(screen.getByRole("main")).getAllByRole("link", {
      name: /lista de espera/i,
    });

    expect(ctas.at(-1)).toHaveAttribute("href", "#");
  });

  it("sobrescreve o template de título da raiz", () => {
    expect(metadata.title).toEqual({
      absolute: "Orbien — Gestão que serve. Igreja que cresce.",
    });
  });
});
