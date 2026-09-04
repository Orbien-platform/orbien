import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound, { metadata } from "./not-found";

describe("NotFound", () => {
  it("mantém header e footer, para o visitante não ficar sem navegação", () => {
    render(<NotFound />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("mostra o código 404 e explica o que aconteceu", () => {
    render(<NotFound />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Página não encontrada")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Esse caminho não existe." }),
    ).toBeInTheDocument();
  });

  it("oferece as duas saídas: home e contato", () => {
    render(<NotFound />);

    expect(
      screen.getByRole("link", { name: /Voltar para a home/ }),
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("link", { name: "Falar com a equipe" }),
    ).toHaveAttribute("href", "/contato");
  });

  it("declara o título da página de erro", () => {
    expect(metadata.title).toBe("Página não encontrada");
  });
});
