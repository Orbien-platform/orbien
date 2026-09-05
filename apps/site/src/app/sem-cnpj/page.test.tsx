import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import SemCnpjPage, { metadata } from "./page";

describe("SemCnpjPage", () => {
  it("renderiza o header, o footer e a chamada da página", () => {
    render(<SemCnpjPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Comece hoje. Formalize depois." }),
    ).toBeInTheDocument();
  });

  it("monta as sete seções da rota na ordem esperada", () => {
    render(<SemCnpjPage />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "Três passos e sua igreja está no ar.",
      "O dinheiro vai direto pra sua igreja.",
      "O que está incluído sem CNPJ.",
      "A formalização chegou? A migração leva 15 minutos.",
      "As perguntas que toda igreja sem CNPJ faz.",
      "Pronto pra ver na sua igreja?",
    ]);
  });

  it("aponta o CTA do hero para a lista de espera", () => {
    render(<SemCnpjPage />);

    const [cta] = within(screen.getByRole("main")).getAllByRole("link", {
      name: /lista de espera/i,
    });

    expect(cta).toHaveAttribute("href", "#waitlist");
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Sem CNPJ");
    expect(metadata.description).toContain("PIX");
  });
});
