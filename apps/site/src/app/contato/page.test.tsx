import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ContatoPage, { metadata } from "./page";

describe("ContatoPage", () => {
  it("renderiza o header, o footer e o conteúdo de contato", () => {
    render(<ContatoPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Fale com a gente." }),
    ).toBeInTheDocument();
  });

  it("não tem formulário — o contato do site é por WhatsApp", () => {
    const { container } = render(<ContatoPage />);

    expect(container.querySelector("form")).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /WhatsApp/i }).length,
    ).toBeGreaterThan(0);
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Contato");
    expect(metadata.description).toContain("WhatsApp");
  });
});
