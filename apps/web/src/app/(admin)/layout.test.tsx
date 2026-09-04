import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminLayout from "./layout";

// A casca só compõe: os três componentes têm spec própria (Fase 8 e 9). Aqui
// o que se prova é que a composição está de pé — sobretudo que a faixa de
// sessão de suporte continua no layout, ver CLAUDE.md.
vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <nav>sidebar</nav>,
}));
vi.mock("@/components/layout/header", () => ({
  Header: () => <header>header</header>,
}));
vi.mock("@/components/layout/SupportSessionBanner", () => ({
  SupportSessionBanner: () => <div>faixa de suporte</div>,
}));

describe("AdminLayout", () => {
  it("compõe sidebar, faixa de suporte, header e o conteúdo em <main>", () => {
    render(AdminLayout({ children: <p>conteúdo da tela</p> }));

    expect(screen.getByText("sidebar")).toBeInTheDocument();
    expect(screen.getByText("faixa de suporte")).toBeInTheDocument();
    expect(screen.getByText("header")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("conteúdo da tela");
  });

  it("esconde a sidebar abaixo de lg", () => {
    const { container } = render(AdminLayout({ children: null }));
    expect(container.querySelector(".hidden.lg\\:flex")).not.toBeNull();
  });
});
