import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

const mockedUsePathname = vi.mocked(usePathname);

describe("Sidebar", () => {
  it("mostra o nome padrão da congregação e todos os itens de navegação", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    expect(screen.getByText("orbien")).toBeInTheDocument();
    expect(screen.getByText("Doca Church")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Pessoas")).toBeInTheDocument();
    expect(screen.getByText("Grupos")).toBeInTheDocument();
    expect(screen.getByText("Financeiro")).toBeInTheDocument();
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
    expect(screen.getByText("Voluntários")).toBeInTheDocument();
    expect(screen.getByText("Celebrações")).toBeInTheDocument();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
  });

  it("usa o nome de congregação customizado", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar congregationName="Igreja Central" />);
    expect(screen.getByText("Igreja Central")).toBeInTheDocument();
  });

  it("marca o item ativo quando o pathname é exatamente a rota", () => {
    mockedUsePathname.mockReturnValue("/pessoas");
    render(<Sidebar />);
    const link = screen.getByText("Pessoas").closest("a");
    expect(link?.className).toContain("text-navy");
  });

  it("marca o item ativo quando o pathname é uma sub-rota", () => {
    mockedUsePathname.mockReturnValue("/pessoas/123");
    render(<Sidebar />);
    const link = screen.getByText("Pessoas").closest("a");
    expect(link?.className).toContain("text-navy");
  });

  it("não marca como ativo um item cujo pathname só compartilha o prefixo", () => {
    mockedUsePathname.mockReturnValue("/pessoas-extra");
    render(<Sidebar />);
    const link = screen.getByText("Pessoas").closest("a");
    expect(link?.className).not.toContain("text-navy");
    expect(link?.className).toContain("text-stone");
  });

  it("aponta cada link para o href correto", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    expect(screen.getByText("Financeiro").closest("a")).toHaveAttribute(
      "href",
      "/financeiro"
    );
  });
});
