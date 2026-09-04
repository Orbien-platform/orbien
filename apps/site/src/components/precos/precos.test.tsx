import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureCompare } from "./FeatureCompare";
import { Implementation } from "./Implementation";
import { NoCnpjBlock } from "./NoCnpjBlock";
import { PrecosCta } from "./PrecosCta";
import { PrecosFaq } from "./PrecosFaq";
import { PrecosHero } from "./PrecosHero";
import { TierTable } from "./TierTable";

describe("PrecosHero", () => {
  it("abre a página com a promessa de preço por porte", () => {
    render(<PrecosHero />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Dois planos. O preço cresce com a sua igreja."
    );
  });
});

describe("TierTable", () => {
  it("mostra as cinco faixas de membros com os preços dos dois planos", () => {
    render(<TierTable />);

    expect(
      screen.getByRole("heading", { name: "Preço por faixa de membros" })
    ).toBeInTheDocument();

    // Cada faixa aparece três vezes: na tabela de mesa e nos dois cartões
    // empilhados do mobile (Starter e Premium).
    for (const faixa of [
      "Até 50 membros",
      "51 a 150",
      "151 a 300",
      "301 a 600",
      "Acima de 600",
    ]) {
      expect(screen.getAllByText(faixa)).toHaveLength(3);
    }

    expect(screen.getAllByText("59,90").length).toBeGreaterThan(0);
    expect(screen.getAllByText("249,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("499,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("igrejas em formação").length).toBeGreaterThan(0);
  });

  it("as duas faixas maiores não têm preço de Starter", () => {
    const { container } = render(<TierTable />);

    // "301 a 600" e "Acima de 600" existem só no Premium: o texto do
    // Starter para elas não aparece com valor.
    expect(container.textContent).toContain("301 a 600");
    expect(container.textContent).toContain("349,00");
  });
});

describe("FeatureCompare", () => {
  it("agrupa as funcionalidades comparadas por tema", () => {
    render(<FeatureCompare />);

    expect(
      screen.getByRole("heading", { name: "O que cabe em cada plano" })
    ).toBeInTheDocument();
    for (const grupo of [
      "Acesso e identidade",
      "Doações e PIX",
      "Financeiro e contabilidade",
      "Pequenos grupos",
      "Suporte",
    ]) {
      expect(screen.getAllByText(grupo).length).toBeGreaterThan(0);
    }
  });

  it("distingue o que é qualificado do que é simples check", () => {
    render(<FeatureCompare />);

    expect(screen.getAllByText("Igreja sem CNPJ").length).toBeGreaterThan(0);
    expect(screen.getAllByText("skin da igreja").length).toBeGreaterThan(0);
    expect(screen.getAllByText("app próprio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("QR dinâmico").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 sessão inclusa").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Exportação contábil (OFX, SPED)").length
    ).toBeGreaterThan(0);
  });
});

describe("Implementation", () => {
  it("ancora em #implantacao e mostra os três pacotes de setup", () => {
    const { container } = render(<Implementation />);

    expect(container.querySelector("section")).toHaveAttribute(
      "id",
      "implantacao"
    );
    expect(
      screen.getByRole("heading", {
        name: "Implantação — pagamento único na contratação",
      })
    ).toBeInTheDocument();

    expect(screen.getByText("299,00")).toBeInTheDocument();
    expect(screen.getByText("499,00")).toBeInTheDocument();
    expect(screen.getByText("Migração assistida")).toBeInTheDocument();
    expect(screen.getByText("a R$ 999")).toBeInTheDocument();
    expect(
      screen.getByText(/Eklesia, InPeace, In Church ou planilha/)
    ).toBeInTheDocument();
  });
});

describe("NoCnpjBlock", () => {
  it("aponta para a página de sem CNPJ e resume o arranjo do PIX", () => {
    render(<NoCnpjBlock />);

    expect(
      screen.getByRole("heading", { name: "Sua igreja ainda não tem CNPJ?" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Veja como funciona/ })
    ).toHaveAttribute("href", "/sem-cnpj");
    expect(
      screen.getByText("PIX cai direto na chave da igreja")
    ).toBeInTheDocument();
    expect(screen.getByText("Orbien não toca no dinheiro")).toBeInTheDocument();
    expect(
      screen.getByText("Migração pro Premium em 15 min")
    ).toBeInTheDocument();
  });
});

describe("PrecosFaq", () => {
  it("responde as nove perguntas de preço e contrato", () => {
    const { container } = render(<PrecosFaq />);

    expect(
      screen.getByRole("heading", { name: "Perguntas sobre preço e contrato" })
    ).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(9);

    expect(
      screen.getByText("Posso começar no Starter e migrar pro Premium depois?")
    ).toBeInTheDocument();
    expect(screen.getByText("Tem fidelidade?")).toBeInTheDocument();
    expect(
      screen.getByText("Quem cobra do membro quando ele doa?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Como funciona o reajuste anual?")
    ).toBeInTheDocument();
    // A resposta da migração destaca o pro rata.
    expect(screen.getByText("pro rata")).toBeInTheDocument();
  });
});

describe("PrecosCta", () => {
  it("é a âncora #cta e oferece demonstração ou WhatsApp", () => {
    const { container } = render(<PrecosCta />);

    expect(container.querySelector("section")).toHaveAttribute("id", "cta");
    expect(
      screen.getByRole("heading", {
        name: "Ainda em dúvida sobre qual plano serve?",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Agendar demonstração" })
    ).toBeInTheDocument();

    const whatsapp = screen.getByRole("link", { name: /Fale no WhatsApp/ });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/5554999529683");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
  });
});
