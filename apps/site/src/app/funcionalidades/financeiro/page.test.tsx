import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import FinanceiroPage, { metadata } from "./page";

describe("FinanceiroPage", () => {
  it("renderiza o header, o footer e a chamada do módulo", () => {
    render(<FinanceiroPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "O dinheiro da sua igreja, organizado." }),
    ).toBeInTheDocument();
  });

  it("monta as seis seções da rota na ordem esperada", () => {
    render(<FinanceiroPage />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "Três formas de receber via PIX.",
      "Do recibo ao balanço anual.",
      "A tesoureira abre a segunda-feira e já tem tudo.",
      "Perguntas sobre o módulo financeiro.",
      "Pronto pra ver na sua igreja?",
    ]);
  });

  it("aponta o CTA do hero para a lista de espera", () => {
    render(<FinanceiroPage />);

    const [cta] = within(screen.getByRole("main")).getAllByRole("link", {
      name: /lista de espera/i,
    });

    expect(cta).toHaveAttribute("href", "#waitlist");
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Financeiro");
    expect(metadata.description).toContain("PIX");
  });
});
