import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RootLayout, { metadata as metadataRaiz } from "./layout";
import Home, { metadata as metadataHome } from "./page";
import NotFound, { metadata as metadataNotFound } from "./not-found";
import LoginPage, { metadata as metadataLogin } from "./login/page";
import ContatoPage, { metadata as metadataContato } from "./contato/page";
import LgpdPage, { metadata as metadataLgpd } from "./lgpd/page";
import PrecosPage, { metadata as metadataPrecos } from "./precos/page";
import SemCnpjPage, { metadata as metadataSemCnpj } from "./sem-cnpj/page";
import SobrePage, { metadata as metadataSobre } from "./sobre/page";
import FuncionalidadesPage, {
  metadata as metadataFuncionalidades,
} from "./funcionalidades/page";
import MembrosPage, {
  metadata as metadataMembros,
} from "./funcionalidades/membros/page";
import FinanceiroPage, {
  metadata as metadataFinanceiro,
} from "./funcionalidades/financeiro/page";
import PequenosGruposPage, {
  metadata as metadataPequenosGrupos,
} from "./funcionalidades/pequenos-grupos/page";
import ConteudosPage, {
  metadata as metadataConteudos,
} from "./funcionalidades/conteudos/page";
import robots from "./robots";
import sitemap from "./sitemap";

// `next/font/google` só resolve sob o build do Next; o layout usa apenas a
// `variable` de cada fonte.
vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ variable: "--font-dm-sans" }),
  DM_Mono: () => ({ variable: "--font-dm-mono" }),
}));
vi.mock("./globals.css", () => ({}));

/**
 * Todas as páginas do site são Server Components sem `async`, então dá para
 * invocá-las como função e renderizar o JSX devolvido — é a premissa que a
 * Fase 0 validou.
 */
function renderizarPagina(pagina: () => ReactElement) {
  return render(pagina());
}

/** Cabeçalho e rodapé entram em toda página; a checagem é a mesma. */
function esperaCascaCompleta() {
  expect(
    screen.getByRole("navigation", { name: "Principal" })
  ).toBeInTheDocument();
  expect(screen.getByText("Legal e segurança")).toBeInTheDocument();
}

describe("RootLayout", () => {
  it("declara o template de título e a descrição padrão", () => {
    expect(metadataRaiz.metadataBase?.toString()).toBe("https://useorbien.com/");
    expect(metadataRaiz.title).toEqual({
      template: "%s — Orbien",
      default: "Orbien — Gestão que serve. Igreja que cresce.",
    });
    expect(metadataRaiz.description).toContain(
      "Plataforma de gestão para igrejas"
    );
  });

  it("monta <html lang=pt-BR> com as variáveis de fonte", () => {
    const arvore = RootLayout({ children: <p>conteúdo</p> }) as ReactElement<{
      lang: string;
      className: string;
      children: ReactElement;
    }>;

    expect(arvore.type).toBe("html");
    expect(arvore.props.lang).toBe("pt-BR");
    expect(arvore.props.className).toContain("--font-dm-sans");
    expect(arvore.props.className).toContain("--font-dm-mono");

    render(arvore.props.children);
    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });
});

describe("Home", () => {
  it("usa título absoluto — a home não leva o sufixo do template", () => {
    expect(metadataHome.title).toEqual({
      absolute: "Orbien — Gestão que serve. Igreja que cresce.",
    });
  });

  it("empilha as nove seções entre cabeçalho e rodapé", () => {
    renderizarPagina(Home);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A plataforma de gestão que cabe na sua igreja."
    );
    expect(screen.getByText(/Feito com pastores, para pastores/)).toBeInTheDocument();
    expect(screen.getByText("Por que Orbien")).toBeInTheDocument();
    expect(screen.getByText("Igrejas-piloto")).toBeInTheDocument();
    // "Comparativo" também é link do rodapé.
    expect(screen.getAllByText("Comparativo").length).toBeGreaterThan(1);
    expect(screen.getByText("Planos")).toBeInTheDocument();
    expect(screen.getByText("FAQ")).toBeInTheDocument();
    expect(screen.getByText("Lista de espera aberta")).toBeInTheDocument();
  });
});

describe("/funcionalidades", () => {
  it("apresenta o hub dos quatro módulos", () => {
    expect(metadataFuncionalidades.title).toBe("Funcionalidades");
    renderizarPagina(FuncionalidadesPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Uma plataforma. Quatro módulos."
    );
    expect(screen.getByText("Lista de espera aberta")).toBeInTheDocument();
  });

  it("a página de membros monta hero, ciclo, recursos, painel e FAQ", () => {
    expect(metadataMembros.title).toBe("Membros e Visitantes");
    renderizarPagina(MembrosPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Do visitante ao membro — sem planilha."
    );
    expect(screen.getByText("Três estágios. Um fluxo automático.")).toBeInTheDocument();
    expect(screen.getByText("Cadastro em 30 segundos")).toBeInTheDocument();
    expect(
      screen.getByText("Perguntas sobre o módulo de membros.")
    ).toBeInTheDocument();
  });

  it("a página de financeiro monta os cenários de PIX e o relatório", () => {
    expect(metadataFinanceiro.title).toBe("Financeiro");
    renderizarPagina(FinanceiroPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "O dinheiro da sua igreja, organizado."
    );
    expect(screen.getByText("Três formas de receber via PIX.")).toBeInTheDocument();
    expect(
      screen.getByText("Gerado automaticamente toda segunda-feira")
    ).toBeInTheDocument();
  });

  it("a página de pequenos grupos monta o semáforo e o fluxo do líder", () => {
    expect(metadataPequenosGrupos.title).toBe("Pequenos Grupos");
    renderizarPagina(PequenosGruposPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Grupos saudáveis não aparecem por acaso."
    );
    expect(screen.getByText("Verde — Saudável")).toBeInTheDocument();
    expect(
      screen.getByText("O líder registra no celular. O pastor vê na hora.")
    ).toBeInTheDocument();
  });

  it("a página de conteúdos monta os tipos e a segmentação", () => {
    expect(metadataConteudos.title).toBe("Conteúdos e Notificações");
    renderizarPagina(ConteudosPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "A igreja presente entre os cultos."
    );
    expect(screen.getByText("Três canais. Uma só plataforma.")).toBeInTheDocument();
    expect(
      screen.getByText("A mensagem certa para quem precisa ver.")
    ).toBeInTheDocument();
  });
});

describe("/precos", () => {
  it("monta a tabela por faixa, o comparativo e a implantação", () => {
    expect(metadataPrecos.title).toBe("Preços");
    renderizarPagina(PrecosPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Dois planos. O preço cresce com a sua igreja."
    );
    expect(screen.getByText("Preço por faixa de membros")).toBeInTheDocument();
    expect(screen.getByText("O que cabe em cada plano")).toBeInTheDocument();
    expect(
      screen.getByText("Implantação — pagamento único na contratação")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sua igreja ainda não tem CNPJ?")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Perguntas sobre preço e contrato")
    ).toBeInTheDocument();
  });
});

describe("/sem-cnpj", () => {
  it("monta o fluxo do PIX e o caminho de upgrade", () => {
    expect(metadataSemCnpj.title).toBe("Sem CNPJ");
    renderizarPagina(SemCnpjPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Comece hoje. Formalize depois."
    );
    expect(
      screen.getByText("Três passos e sua igreja está no ar.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("O dinheiro vai direto pra sua igreja.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("A formalização chegou? A migração leva 15 minutos.")
    ).toBeInTheDocument();
  });
});

describe("/sobre", () => {
  it("monta o histórico, os princípios e o estágio atual", () => {
    expect(metadataSobre.title).toBe("Sobre");
    renderizarPagina(SobrePage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Gestão que serve. Igreja que cresce."
    );
    expect(
      screen.getByText("O mercado ignorou igrejas pequenas por tempo demais.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quatro princípios que guiam tudo.")
    ).toBeInTheDocument();
    expect(screen.getByText("Estágio atual")).toBeInTheDocument();
  });
});

describe("/contato", () => {
  it("monta o conteúdo de contato, sem formulário", () => {
    expect(metadataContato.title).toBe("Contato");
    expect(metadataContato.description).toContain("WhatsApp");
    renderizarPagina(ContatoPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Fale com a gente."
    );
    expect(document.querySelector("form")).toBeNull();
  });
});

describe("/lgpd", () => {
  it("monta a política inteira", () => {
    expect(metadataLgpd.title).toBe("Política de Privacidade e LGPD");
    renderizarPagina(LgpdPage);

    esperaCascaCompleta();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Política de Privacidade e LGPD"
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(10);
  });
});

describe("/login", () => {
  it("avisa que o acesso ainda não abriu e oferece a lista de espera", () => {
    expect(metadataLogin.title).toBe("Entrar");
    renderizarPagina(LoginPage);

    esperaCascaCompleta();
    expect(screen.getByText("Em breve")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "O acesso vai abrir em breve."
    );
    expect(
      screen.getByRole("link", { name: /Entrar na lista de espera/ })
    ).toHaveAttribute("href", "#waitlist");
    expect(
      screen.getByRole("link", { name: "Fale no WhatsApp" })
    ).toHaveAttribute("href", "https://wa.me/5554999529683");
    // A tela não tem campo de login: o painel vive no `apps/web`.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("not-found", () => {
  it("mostra o 404 com saída para a home e para o contato", () => {
    expect(metadataNotFound.title).toBe("Página não encontrada");
    renderizarPagina(NotFound);

    esperaCascaCompleta();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Página não encontrada")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Esse caminho não existe."
    );
    expect(
      screen.getByRole("link", { name: /Voltar para a home/ })
    ).toHaveAttribute("href", "/");
    expect(
      screen.getByRole("link", { name: "Falar com a equipe" })
    ).toHaveAttribute("href", "/contato");
  });
});

describe("robots", () => {
  it("libera o site e barra login e API, apontando o sitemap", () => {
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", allow: "/", disallow: ["/login", "/api/"] }],
      sitemap: "https://useorbien.com/sitemap.xml",
    });
  });
});

describe("sitemap", () => {
  it("lista as onze URLs públicas com prioridade decrescente", () => {
    const entradas = sitemap();

    expect(entradas.map((e) => e.url)).toEqual([
      "https://useorbien.com",
      "https://useorbien.com/funcionalidades",
      "https://useorbien.com/funcionalidades/membros",
      "https://useorbien.com/funcionalidades/financeiro",
      "https://useorbien.com/funcionalidades/pequenos-grupos",
      "https://useorbien.com/funcionalidades/conteudos",
      "https://useorbien.com/precos",
      "https://useorbien.com/sem-cnpj",
      "https://useorbien.com/sobre",
      "https://useorbien.com/contato",
      "https://useorbien.com/lgpd",
    ]);

    // A home é a única com prioridade 1; nada além dela chega perto.
    expect(entradas[0].priority).toBe(1);
    expect(entradas[0].changeFrequency).toBe("weekly");
    expect(entradas.at(-1)!.priority).toBe(0.3);
    for (const entrada of entradas) {
      expect(entrada.lastModified).toBeInstanceOf(Date);
    }
    // `/login` não entra: é justamente o que o robots barra.
    expect(entradas.some((e) => e.url.endsWith("/login"))).toBe(false);
  });
});
