import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FuncionalizadesHub } from "./FuncionalizadesHub";

import { MembrosHero } from "./membros/MembrosHero";
import { MembrosCapabilities } from "./membros/MembrosCapabilities";
import { MemberLifecycle } from "./membros/MemberLifecycle";
import { PresencaPanel } from "./membros/PresencaPanel";
import { MembrosFaq } from "./membros/MembrosFaq";

import { FinanceiroHero } from "./financeiro/FinanceiroHero";
import { FinanceiroCapabilities } from "./financeiro/FinanceiroCapabilities";
import { PixCenarios } from "./financeiro/PixCenarios";
import { RelatorioSemanal } from "./financeiro/RelatorioSemanal";
import { FinanceiroFaq } from "./financeiro/FinanceiroFaq";

import { PequenosGruposHero } from "./pequenos-grupos/PequenosGruposHero";
import { PGCapabilities } from "./pequenos-grupos/PGCapabilities";
import { SemaforoSaude } from "./pequenos-grupos/SemaforoSaude";
import { LiderMobile } from "./pequenos-grupos/LiderMobile";
import { PGFaq } from "./pequenos-grupos/PGFaq";

import { ConteudosHero } from "./conteudos/ConteudosHero";
import { ConteudosCapabilities } from "./conteudos/ConteudosCapabilities";
import { TiposConteudo } from "./conteudos/TiposConteudo";
import { AlcanceSection } from "./conteudos/AlcanceSection";
import { ConteudosFaq } from "./conteudos/ConteudosFaq";

describe("FuncionalizadesHub", () => {
  it("apresenta os quatro módulos, cada um apontando para a própria página", () => {
    render(<FuncionalizadesHub />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Uma plataforma. Quatro módulos."
    );

    const destinos = [
      ["Membros e visitantes", "/funcionalidades/membros"],
      ["Financeiro", "/funcionalidades/financeiro"],
      ["Pequenos grupos", "/funcionalidades/pequenos-grupos"],
      ["Conteúdos e notificações", "/funcionalidades/conteudos"],
    ] as const;

    for (const [titulo, href] of destinos) {
      expect(screen.getByText(titulo).closest("a")).toHaveAttribute(
        "href",
        href
      );
    }
  });

  it("cada cartão resume três destaques do módulo", () => {
    render(<FuncionalizadesHub />);

    const membros = screen.getByText("Membros e visitantes").closest("a")!;
    expect(within(membros).getByText("QR code na entrada")).toBeInTheDocument();
    expect(
      within(membros).getByText("Deduplicação inteligente")
    ).toBeInTheDocument();
    expect(
      within(membros).getByText("Semáforo de presença")
    ).toBeInTheDocument();

    expect(screen.getByText("PIX sem taxa no Starter")).toBeInTheDocument();
    expect(screen.getByText("Semáforo de saúde")).toBeInTheDocument();
    expect(screen.getByText("Pedidos de oração")).toBeInTheDocument();
  });
});

describe("Módulo — membros", () => {
  it("o hero promete o fluxo sem planilha e leva à lista de espera", () => {
    render(<MembrosHero />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Do visitante ao membro — sem planilha."
    );
    expect(
      screen.getByRole("link", { name: /Entrar na lista de espera/ })
    ).toHaveAttribute("href", "#waitlist");
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/funcionalidades")
    ).toBe(true);
  });

  it("lista os seis recursos do módulo", () => {
    render(<MembrosCapabilities />);

    expect(
      screen.getByRole("heading", {
        name: "Seis recursos que a secretária vai usar toda semana.",
      })
    ).toBeInTheDocument();
    for (const recurso of [
      "Cadastro em 30 segundos",
      "Deduplicação inteligente",
      "Acompanhamento de presença",
      "Perfil completo do membro",
      "Integração WhatsApp",
      "Ministérios e funções",
    ]) {
      expect(screen.getByText(recurso)).toBeInTheDocument();
    }
  });

  it("descreve os três estágios do ciclo de vida", () => {
    render(<MemberLifecycle />);

    expect(
      screen.getByRole("heading", { name: "Três estágios. Um fluxo automático." })
    ).toBeInTheDocument();
    expect(screen.getByText("Primeiro contato")).toBeInTheDocument();
    expect(screen.getByText("Engajamento crescente")).toBeInTheDocument();
    expect(screen.getByText("Filiação confirmada")).toBeInTheDocument();
  });

  it("o painel de presença promete que ninguém some sem aviso", () => {
    render(<PresencaPanel />);

    expect(
      screen.getByRole("heading", {
        name: "Nenhum visitante some sem que a liderança saiba.",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Acompanhamento")).toBeInTheDocument();
  });

  it("o FAQ responde as seis dúvidas do módulo", () => {
    const { container } = render(<MembrosFaq />);

    expect(
      screen.getByRole("heading", { name: "Perguntas sobre o módulo de membros." })
    ).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(6);
    expect(
      screen.getByText("Tem limite de membros e visitantes cadastrados?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Posso importar minha lista atual de membros?")
    ).toBeInTheDocument();
  });
});

describe("Módulo — financeiro", () => {
  it("o hero leva à lista de espera e aos preços", () => {
    render(<FinanceiroHero />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "O dinheiro da sua igreja, organizado."
    );
    expect(
      screen.getByRole("link", { name: /Entrar na lista de espera/ })
    ).toHaveAttribute("href", "#waitlist");
    expect(
      screen.getAllByRole("link").some((a) => a.getAttribute("href") === "/precos")
    ).toBe(true);
  });

  it("cobre do recibo ao balanço anual", () => {
    render(<FinanceiroCapabilities />);

    expect(
      screen.getByRole("heading", { name: "Do recibo ao balanço anual." })
    ).toBeInTheDocument();
    for (const recurso of [
      "Recibo automático",
      "Dashboard financeiro",
      "Relatório semanal automático",
      "DRE, fluxo de caixa e forecast",
      "Exportação contábil",
      "Carnê do dizimista",
    ]) {
      expect(screen.getByText(recurso)).toBeInTheDocument();
    }
    expect(screen.getByText(/Exporte em OFX e SPED/)).toBeInTheDocument();
  });

  it("explica os três arranjos de PIX, incluindo o repasse via Asaas", () => {
    render(<PixCenarios />);

    expect(
      screen.getByRole("heading", { name: "Três formas de receber via PIX." })
    ).toBeInTheDocument();
    expect(screen.getByText("PIX por chave manual")).toBeInTheDocument();
    expect(screen.getByText("PIX dinâmico")).toBeInTheDocument();
    expect(screen.getByText("Dízimo recorrente")).toBeInTheDocument();
    expect(
      screen.getByText(/A Asaas processa, confirma e repassa/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/a Orbien não toca no dinheiro/)
    ).toBeInTheDocument();
  });

  it("o relatório semanal chega pronto na segunda", () => {
    render(<RelatorioSemanal />);

    expect(
      screen.getByRole("heading", {
        name: "A tesoureira abre a segunda-feira e já tem tudo.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Gerado automaticamente toda segunda-feira")
    ).toBeInTheDocument();
    expect(screen.getByText("Exportar PDF")).toBeInTheDocument();
  });

  it("o FAQ do financeiro responde a taxa e a exportação", () => {
    const { container } = render(<FinanceiroFaq />);

    expect(container.querySelectorAll("details")).toHaveLength(6);
    expect(
      screen.getByText("Quanto a Orbien cobra sobre as doações?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Posso exportar para o meu contador?")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Ver perguntas sobre preços e contrato →",
      })
    ).toHaveAttribute("href", "/precos#faq");
  });
});

describe("Módulo — pequenos grupos", () => {
  it("o hero fala de grupos saudáveis", () => {
    render(<PequenosGruposHero />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Grupos saudáveis não aparecem por acaso."
    );
    expect(
      screen.getByRole("link", { name: /Entrar na lista de espera/ })
    ).toHaveAttribute("href", "#waitlist");
  });

  it("lista os seis recursos, incluindo a terminologia configurável", () => {
    render(<PGCapabilities />);

    expect(
      screen.getByRole("heading", { name: "Tudo para o líder focar na reunião." })
    ).toBeInTheDocument();
    expect(screen.getByText("Materiais agendados")).toBeInTheDocument();
    expect(screen.getByText("Semáforo de saúde")).toBeInTheDocument();
    expect(screen.getByText("Terminologia configurável")).toBeInTheDocument();
    expect(
      screen.getByText(/Célula, pequeno grupo, EBD, ministério, discipulado/)
    ).toBeInTheDocument();
  });

  it("o semáforo tem as três cores com o que cada uma significa", () => {
    render(<SemaforoSaude />);

    expect(
      screen.getByRole("heading", { name: "O pastor sabe qual grupo está esfriando." })
    ).toBeInTheDocument();
    expect(screen.getByText("Verde — Saudável")).toBeInTheDocument();
    expect(screen.getByText("Amarelo — Atenção")).toBeInTheDocument();
    expect(screen.getByText("Vermelho — Inativo")).toBeInTheDocument();
    expect(screen.getByText("Grupo ativo e engajado")).toBeInTheDocument();
    expect(screen.getByText("Grupo parado")).toBeInTheDocument();
  });

  it("o fluxo do líder vai da notificação ao painel", () => {
    render(<LiderMobile />);

    expect(
      screen.getByRole("heading", {
        name: "O líder registra no celular. O pastor vê na hora.",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Notificação automática")).toBeInTheDocument();
    expect(screen.getByText("Líder registra presença")).toBeInTheDocument();
    expect(screen.getByText("Painel atualizado")).toBeInTheDocument();
  });

  it("o FAQ trata da terminologia e do semáforo no Starter", () => {
    const { container } = render(<PGFaq />);

    expect(container.querySelectorAll("details")).toHaveLength(6);
    expect(
      screen.getByText(
        "Posso chamar de EBD, ministério ou discipulado em vez de célula?"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("O semáforo de saúde está disponível no Starter?")
    ).toBeInTheDocument();
  });
});

describe("Módulo — conteúdos", () => {
  it("o hero fala da igreja presente entre os cultos", () => {
    render(<ConteudosHero />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A igreja presente entre os cultos."
    );
    expect(
      screen.getByRole("link", { name: /Entrar na lista de espera/ })
    ).toHaveAttribute("href", "#waitlist");
  });

  it("lista os seis recursos, do modo silencioso à identidade visual", () => {
    render(<ConteudosCapabilities />);

    expect(
      screen.getByRole("heading", { name: "Comunicação que a comunidade abre." })
    ).toBeInTheDocument();
    expect(screen.getByText("Agenda de eventos")).toBeInTheDocument();
    expect(screen.getByText("Métricas de leitura")).toBeInTheDocument();
    expect(screen.getByText("Modo silencioso por horário")).toBeInTheDocument();
    expect(
      screen.getByText(/bloqueadas automaticamente entre 22h e 7h/)
    ).toBeInTheDocument();
    expect(screen.getByText(/vê "Igreja da Graça"/)).toBeInTheDocument();
  });

  it("os três tipos de conteúdo aparecem com a explicação de cada um", () => {
    render(<TiposConteudo />);

    expect(
      screen.getByRole("heading", { name: "Três canais. Uma só plataforma." })
    ).toBeInTheDocument();
    expect(screen.getByText("Comunicados e avisos")).toBeInTheDocument();
    expect(screen.getByText("Devocionais diários")).toBeInTheDocument();
    expect(screen.getByText("Pedidos de oração")).toBeInTheDocument();
  });

  it("a segmentação cobre todos, grupo e ministério", () => {
    render(<AlcanceSection />);

    expect(
      screen.getByRole("heading", { name: "A mensagem certa para quem precisa ver." })
    ).toBeInTheDocument();
    expect(screen.getByText("Todos os membros")).toBeInTheDocument();
    expect(screen.getByText("Pequeno grupo")).toBeInTheDocument();
    expect(screen.getByText("Ministério ou cargo")).toBeInTheDocument();
    expect(
      screen.getByText(/sem criar grupos de WhatsApp/)
    ).toBeInTheDocument();
  });

  it("o FAQ trata de push com app fechado e de oração privada", () => {
    const { container } = render(<ConteudosFaq />);

    expect(container.querySelectorAll("details")).toHaveLength(6);
    expect(
      screen.getByText("Os membros recebem notificação mesmo com o app fechado?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Como funciona o pedido de oração privado?")
    ).toBeInTheDocument();
  });
});
