import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EstagioAtual } from "./EstagioAtual";
import { PorQueExistimos } from "./PorQueExistimos";
import { PrincipiosSection } from "./PrincipiosSection";
import { SobreHero } from "./SobreHero";

describe("SobreHero", () => {
  it("abre com o posicionamento e os quatro metadados da empresa", () => {
    render(<SobreHero />);

    expect(screen.getByText("Sobre a Orbien")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Gestão que serve. Igreja que cresce."
    );
    expect(screen.getByText("Church Platform Ltda")).toBeInTheDocument();
    expect(screen.getByText("Passo Fundo · RS")).toBeInTheDocument();
    expect(screen.getByText("Em desenvolvimento ativo")).toBeInTheDocument();
    expect(screen.getByText("Fase piloto · 2026")).toBeInTheDocument();
  });
});

describe("PorQueExistimos", () => {
  it("nomeia os três problemas do mercado", () => {
    render(<PorQueExistimos />);

    expect(
      screen.getByRole("heading", {
        name: "O mercado ignorou igrejas pequenas por tempo demais.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Caro demais para quem está começando")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Interface que afasta, não que ajuda")
    ).toBeInTheDocument();
    expect(screen.getByText("Exige CNPJ onde não devia")).toBeInTheDocument();
  });

  it("responde com as quatro escolhas do produto", () => {
    render(<PorQueExistimos />);

    expect(
      screen.getByRole("heading", {
        name: "Uma plataforma que começa pequena e cresce junto.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Planos por faixa de membros/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Starter sem CNPJ, com PIX direto na chave da igreja/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Migração para o Premium em 15 minutos quando formalizar/)
    ).toBeInTheDocument();
  });
});

describe("PrincipiosSection", () => {
  it("lista os quatro princípios com o texto de cada um", () => {
    render(<PrincipiosSection />);

    expect(
      screen.getByRole("heading", { name: "Quatro princípios que guiam tudo." })
    ).toBeInTheDocument();
    expect(screen.getByText("Rigor sem frieza")).toBeInTheDocument();
    expect(screen.getByText("Construído com pastores")).toBeInTheDocument();
    expect(screen.getByText("Transparência radical")).toBeInTheDocument();
    expect(screen.getByText("Mobile-first, sempre")).toBeInTheDocument();
    expect(
      screen.getByText(/Precision Modern é nossa direção de design/)
    ).toBeInTheDocument();
  });
});

describe("EstagioAtual", () => {
  it("é explícito sobre a fase piloto e traz os dois contatos", () => {
    render(<EstagioAtual />);

    expect(screen.getByText("Estágio atual")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Estamos em fase piloto — e somos transparentes sobre isso.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Cada feature é validada com um pastor/)
    ).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /Entrar na lista de espera/ })
    ).toHaveAttribute("href", "#waitlist");
    const whatsapp = screen.getByRole("link", { name: /Falar no WhatsApp/ });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/5554999529683");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("a linha do tempo separa concluído, em andamento e próximo", () => {
    render(<EstagioAtual />);

    expect(screen.getByText("Linha do tempo")).toBeInTheDocument();
    expect(
      screen.getByText("Fundação e arquitetura do produto")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Validação com igrejas-piloto em andamento")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Lançamento público — previsão 2026")
    ).toBeInTheDocument();

    // O estado de cada marco é dito só pela cor do ponto e pela opacidade
    // do texto — o rótulo ("Concluído", "Em andamento", "Próximo") existe em
    // `dotStyle` mas não é renderizado. Registrado como achado; aqui o teste
    // fixa o comportamento atual.
    expect(screen.queryByText("Concluído")).not.toBeInTheDocument();
    const concluido = screen.getByText("Fundação e arquitetura do produto");
    const emAndamento = screen.getByText(
      "Validação com igrejas-piloto em andamento"
    );
    const proximo = screen.getByText("Lançamento público — previsão 2026");
    expect(concluido).toHaveStyle({ color: "rgba(255,255,255,.65)" });
    expect(emAndamento).toHaveStyle({ color: "rgba(255,255,255,.9)" });
    expect(proximo).toHaveStyle({ color: "rgba(255,255,255,.38)" });
  });
});
