import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminLayout from "./layout";

// Sidebar/Header/SupportSessionBanner já têm cobertura própria (Fase 8) — aqui
// são ruído: exigiriam mocks de useAuth/usePathname/useTheme que não dizem
// respeito ao que este arquivo faz, que é só montar o esqueleto de layout.
vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock("@/components/layout/header", () => ({
  Header: () => <div data-testid="header" />,
}));
vi.mock("@/components/layout/SupportSessionBanner", () => ({
  SupportSessionBanner: () => <div data-testid="support-banner" />,
}));

describe("AdminLayout", () => {
  it("renderiza sidebar, banner, header e o conteúdo dentro de main", () => {
    render(AdminLayout({ children: <span>Página</span> }));

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("support-banner")).toBeInTheDocument();
    expect(screen.getByTestId("header")).toBeInTheDocument();
    expect(screen.getByText("Página")).toBeInTheDocument();
  });
});
