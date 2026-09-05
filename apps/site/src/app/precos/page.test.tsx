import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import PrecosPage, { metadata } from "./page";

describe("PrecosPage", () => {
  it("renderiza o header, o footer e a chamada de preços", () => {
    render(<PrecosPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Dois planos. O preço cresce com a sua igreja.",
      }),
    ).toBeInTheDocument();
  });

  it("monta as sete seções da rota na ordem esperada", () => {
    render(<PrecosPage />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "Preço por faixa de membros",
      "O que cabe em cada plano",
      "Implantação — pagamento único na contratação",
      "Sua igreja ainda não tem CNPJ?",
      "Perguntas sobre preço e contrato",
      "Ainda em dúvida sobre qual plano serve?",
    ]);
  });

  it("leva para a página sem CNPJ, que é a saída do bloco do Starter", () => {
    render(<PrecosPage />);

    expect(
      screen.getAllByRole("link", { name: /sem CNPJ/i })[0],
    ).toHaveAttribute("href", "/sem-cnpj");
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Preços");
    expect(metadata.description).toContain("planos");
  });
});
