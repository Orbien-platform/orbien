import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import ConteudosPage, { metadata } from "./page";

describe("ConteudosPage", () => {
  it("renderiza o header, o footer e a chamada do módulo", () => {
    render(<ConteudosPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "A igreja presente entre os cultos." }),
    ).toBeInTheDocument();
  });

  it("monta as seis seções da rota na ordem esperada", () => {
    render(<ConteudosPage />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "Três canais. Uma só plataforma.",
      "Comunicação que a comunidade abre.",
      "A mensagem certa para quem precisa ver.",
      "Perguntas sobre conteúdos e notificações.",
      "Pronto pra ver na sua igreja?",
    ]);
  });

  it("aponta o CTA do hero para a lista de espera", () => {
    render(<ConteudosPage />);

    const [cta] = within(screen.getByRole("main")).getAllByRole("link", {
      name: /lista de espera/i,
    });

    expect(cta).toHaveAttribute("href", "#waitlist");
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Conteúdos e Notificações");
    expect(metadata.description).toContain("devocionais");
  });
});
