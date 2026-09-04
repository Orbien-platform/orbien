import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FuncionalizadesHub } from "@/components/funcionalidades/FuncionalizadesHub";

describe("FuncionalizadesHub", () => {
  it("anuncia a seção pelo título", () => {
    render(<FuncionalizadesHub />);
    expect(screen.getByRole("heading", { name: /Uma plataforma\. Quatro módulos\./ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<FuncionalizadesHub />);
    expect(screen.getByText("Funcionalidades")).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<FuncionalizadesHub />);
    for (const texto of [
      "Membros e visitantes",
      "Financeiro",
      "Pequenos grupos",
      "Conteúdos e notificações",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
