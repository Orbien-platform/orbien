import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PequenosGruposPage, { metadata } from "./page";

describe("PequenosGruposPage", () => {
  it("renderiza o header, o footer e a chamada do módulo", () => {
    render(<PequenosGruposPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Grupos saudáveis não aparecem por acaso." }),
    ).toBeInTheDocument();
  });

  it("monta as seis seções da rota na ordem esperada", () => {
    render(<PequenosGruposPage />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "O pastor sabe qual grupo está esfriando.",
      "Tudo para o líder focar na reunião.",
      "O líder registra no celular. O pastor vê na hora.",
      "Perguntas sobre pequenos grupos.",
      "Pronto pra ver na sua igreja?",
    ]);
  });

  it("aponta o CTA do hero para a lista de espera", () => {
    render(<PequenosGruposPage />);

    const [cta] = within(screen.getByRole("main")).getAllByRole("link", {
      name: /lista de espera/i,
    });

    expect(cta).toHaveAttribute("href", "#waitlist");
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Pequenos Grupos");
    expect(metadata.description).toContain("semáforo");
  });
});
