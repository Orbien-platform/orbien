import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureCompare } from "@/components/precos/FeatureCompare";

describe("FeatureCompare", () => {
  it("anuncia a seção e a âncora #compare", () => {
    const { container } = render(<FeatureCompare />);
    expect(screen.getByText("O que está incluso")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "O que cabe em cada plano" })).toBeInTheDocument();
    expect(container.querySelector("section")).toHaveAttribute("id", "compare");
  });

  it("agrupa as linhas nas cinco frentes da gestão", () => {
    render(<FeatureCompare />);
    for (const grupo of [
      "Acesso e identidade",
      "Doações e PIX",
      "Financeiro e contabilidade",
      "Pequenos grupos",
      "Suporte",
    ]) {
      expect(screen.getByText(grupo)).toBeInTheDocument();
    }
  });

  it("repete o cabeçalho dos planos em cada grupo", () => {
    render(<FeatureCompare />);
    // 5 grupos × (cabeçalho desktop + prefixo mobile em cada célula).
    expect(screen.getAllByText("Starter").length).toBe(5);
    expect(screen.getAllByText("Premium").length).toBe(5);
    expect(screen.getAllByText(/Starter ·/).length).toBe(18);
    expect(screen.getAllByText(/Premium ·/).length).toBe(18);
  });

  it("marca com ✓ o que o Starter já entrega", () => {
    render(<FeatureCompare />);
    const linha = screen.getByText("Igreja sem CNPJ").parentElement!;
    const starter = linha.querySelector('[style*="--teal-dim"]');
    expect(starter).not.toBeNull();
  });

  it("marca com — o que é exclusivo do Premium", () => {
    render(<FeatureCompare />);
    const linha = screen.getByText("Domínio próprio (web)").parentElement!;
    expect(linha.textContent).toContain("—");
  });

  it("descreve com texto o que difere em grau, não em presença", () => {
    render(<FeatureCompare />);
    expect(screen.getByText("skin da igreja")).toBeInTheDocument();
    expect(screen.getByText("app próprio")).toBeInTheDocument();
    expect(screen.getByText("chave PIX")).toBeInTheDocument();
    expect(screen.getByText("QR dinâmico")).toBeInTheDocument();
    expect(screen.getByText("1 sessão inclusa")).toBeInTheDocument();
  });

  it("lista as funcionalidades comparadas", () => {
    render(<FeatureCompare />);
    for (const feature of [
      "Cadastro ilimitado de membros",
      "PIX recorrente (dízimo automático)",
      "Exportação contábil (OFX, SPED)",
      "Semáforo de saúde da célula",
      "Suporte por WhatsApp",
    ]) {
      expect(screen.getByText(feature)).toBeInTheDocument();
    }
  });
});
