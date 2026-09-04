import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Header } from "@/components/layout/Header";

describe("Header", () => {
  it("leva a marca para a home", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /orbien/i })).toHaveAttribute("href", "/");
  });

  it("expõe os links principais com os hrefs certos", () => {
    render(<Header />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(within(nav).getByRole("link", { name: "Preços" })).toHaveAttribute("href", "/precos");
    expect(within(nav).getByRole("link", { name: "Sem CNPJ" })).toHaveAttribute("href", "/sem-cnpj");
    expect(within(nav).getByRole("link", { name: "Sobre" })).toHaveAttribute("href", "/sobre");
  });

  it("mostra as duas ações: entrar e lista de espera", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
    expect(screen.getByRole("link", { name: "Lista de espera" })).toHaveAttribute("href", "#waitlist");
  });

  it("traz o gatilho do menu mobile rotulado", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: "Abrir menu" })).toBeInTheDocument();
  });

  it("inclui o dropdown de funcionalidades", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: /funcionalidades/i })).toHaveAttribute("aria-haspopup", "true");
  });
});
