import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import FuncionalizadesPage, { metadata } from "./page";

describe("FuncionalizadesPage", () => {
  it("renderiza o header, o footer e a chamada do hub", () => {
    render(<FuncionalizadesPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Uma plataforma. Quatro módulos." }),
    ).toBeInTheDocument();
  });

  it("apresenta os quatro módulos e fecha com o CTA", () => {
    render(<FuncionalizadesPage />);

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(titles).toEqual([
      "Membros e visitantes",
      "Financeiro",
      "Pequenos grupos",
      "Conteúdos e notificações",
      "Pronto pra ver na sua igreja?",
    ]);
  });

  it("liga cada módulo à sua própria rota", () => {
    const { container } = render(<FuncionalizadesPage />);

    const hrefs = Array.from(
      container.querySelectorAll('main a[href^="/funcionalidades/"]'),
    ).map((a) => a.getAttribute("href"));

    for (const rota of [
      "/funcionalidades/membros",
      "/funcionalidades/financeiro",
      "/funcionalidades/pequenos-grupos",
      "/funcionalidades/conteudos",
    ]) {
      expect(hrefs).toContain(rota);
    }
  });

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Funcionalidades");
    expect(metadata.description).toContain("módulos");
  });
});
