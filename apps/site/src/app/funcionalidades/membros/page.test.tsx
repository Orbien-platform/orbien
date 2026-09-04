import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import MembrosPage, { metadata } from "./page";

describe("MembrosPage", () => {
  it("renderiza o header, o footer e a chamada do módulo", () => {
    render(<MembrosPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Do visitante ao membro — sem planilha." }),
    ).toBeInTheDocument();
  });

  it("monta as seis seções da rota na ordem esperada", () => {
    render(<MembrosPage />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "Três estágios. Um fluxo automático.",
      "Seis recursos que a secretária vai usar toda semana.",
      "Nenhum visitante some sem que a liderança saiba.",
      "Perguntas sobre o módulo de membros.",
      "Pronto pra ver na sua igreja?",
    ]);
  });

  it("aponta o CTA do hero para a lista de espera", () => {
    render(<MembrosPage />);

    const [cta] = within(screen.getByRole("main")).getAllByRole("link", {
      name: /lista de espera/i,
    });

    expect(cta).toHaveAttribute("href", "#waitlist");
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Membros e Visitantes");
    expect(metadata.description).toContain("QR code");
  });
});
