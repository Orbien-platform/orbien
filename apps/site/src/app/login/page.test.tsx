import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import LoginPage, { metadata } from "./page";

describe("LoginPage", () => {
  it("renderiza o header, o footer e o aviso de que o acesso não abriu", () => {
    render(<LoginPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(screen.getByText("Em breve")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "O acesso vai abrir em breve." }),
    ).toBeInTheDocument();
  });

  it("não tem formulário nenhum — o site é estático e não autentica", () => {
    const { container } = render(<LoginPage />);

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });

  it("manda para a lista de espera pela âncora", () => {
    render(<LoginPage />);

    const main = within(screen.getByRole("main"));

    expect(
      main.getByRole("link", { name: /Entrar na lista de espera/ }),
    ).toHaveAttribute("href", "#waitlist");
  });

  it("abre o WhatsApp do piloto em outra aba, sem vazar o referrer", () => {
    render(<LoginPage />);

    const whatsapp = within(screen.getByRole("main")).getByRole("link", {
      name: "Fale no WhatsApp",
    });

    expect(whatsapp).toHaveAttribute("href", "https://wa.me/5554999529683");
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Entrar");
    expect(metadata.description).toContain("lista de espera");
  });
});
