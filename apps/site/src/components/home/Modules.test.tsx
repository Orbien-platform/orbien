import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Modules } from "@/components/home/Modules";

describe("Modules", () => {
  it("anuncia a seção pelo título", () => {
    render(<Modules />);
    expect(screen.getByRole("heading", { name: /O dia a dia, simplificado\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<Modules />);
    for (const texto of [
      "Membros e visitantes",
      "Doações e finanças",
      "Pequenos grupos",
      "Conteúdo e notificações",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });

  it.each([
    ["Membros e visitantes", "/funcionalidades/membros"],
    ["Doações e finanças", "/funcionalidades/financeiro"],
    ["Pequenos grupos", "/funcionalidades/pequenos-grupos"],
    ["Conteúdo e notificações", "/funcionalidades/conteudos"],
  ])("liga o card %s a %s", (titulo, href) => {
    render(<Modules />);
    // O card inteiro é o link, então o nome acessível concatena título,
    // corpo e o "Ver módulo" do rodapé.
    expect(screen.getByRole("link", { name: new RegExp("^" + titulo) })).toHaveAttribute("href", href);
  });
});
