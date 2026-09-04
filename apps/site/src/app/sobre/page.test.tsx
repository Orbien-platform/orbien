import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SobrePage, { metadata } from "./page";

describe("SobrePage", () => {
  it("renderiza o header, o footer e a chamada da página", () => {
    render(<SobrePage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Gestão que serve. Igreja que cresce.",
      }),
    ).toBeInTheDocument();
  });

  it("monta as cinco seções da rota na ordem esperada", () => {
    render(<SobrePage />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "O mercado ignorou igrejas pequenas por tempo demais.",
      "Uma plataforma que começa pequena e cresce junto.",
      "Quatro princípios que guiam tudo.",
      "Estamos em fase piloto — e somos transparentes sobre isso.",
      "Pronto pra ver na sua igreja?",
    ]);
  });

  it("aponta o CTA do estágio atual para a lista de espera", () => {
    render(<SobrePage />);

    const [cta] = within(screen.getByRole("main")).getAllByRole("link", {
      name: /lista de espera/i,
    });

    expect(cta).toHaveAttribute("href", "#waitlist");
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Sobre");
    expect(metadata.description).toContain("piloto");
  });
});
