import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Comparison } from "./Comparison";
import { Credibility } from "./Credibility";
import { FaqSection } from "./FaqSection";
import { FinalCta } from "./FinalCta";
import { Hero } from "./Hero";
import { Modules } from "./Modules";
import { Pillars } from "./Pillars";
import { PricingSection } from "./PricingSection";
import { SocialProof } from "./SocialProof";

describe("Hero", () => {
  it("traz a chamada principal e os dois CTAs", () => {
    render(<Hero />);

    expect(
      screen.getByRole("heading", { level: 1 })
    ).toHaveTextContent("A plataforma de gestão que cabe na sua igreja.");
    expect(
      screen.getByText(/Membros, finanças, células e app próprio nas lojas/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Entrar na lista de espera/ })
    ).toHaveAttribute("href", "#waitlist");
    expect(
      screen.getByRole("link", { name: /Ver como funciona/ })
    ).toHaveAttribute("href", "#pilares");
  });

  it("mostra os três selos de objeção", () => {
    render(<Hero />);

    expect(screen.getByText("SEM CNPJ")).toBeInTheDocument();
    expect(screen.getByText("SEM CARTÃO")).toBeInTheDocument();
    expect(screen.getByText("5 MIN PARA COMEÇAR")).toBeInTheDocument();
  });

  it("os mockups mostram os números de exemplo do painel", () => {
    render(<Hero />);

    expect(screen.getByText("Doações")).toBeInTheDocument();
    expect(screen.getByText("R$ 2.840")).toBeInTheDocument();
    expect(screen.getByText("+14%")).toBeInTheDocument();
    expect(screen.getByText("Visitantes")).toBeInTheDocument();
    expect(screen.getByText("Células ativas")).toBeInTheDocument();
  });
});

describe("SocialProof", () => {
  it("nomeia a igreja-piloto e o compromisso de validação", () => {
    render(<SocialProof />);

    expect(screen.getByText("Igrejas-piloto")).toBeInTheDocument();
    expect(screen.getByText("Doca Church")).toBeInTheDocument();
    expect(
      screen.getByText(/validada com um pastor antes de ir pra produção/)
    ).toBeInTheDocument();
  });
});

describe("Pillars", () => {
  it("ancora em #pilares e lista os três pilares", () => {
    const { container } = render(<Pillars />);

    expect(container.querySelector("section")).toHaveAttribute("id", "pilares");
    expect(screen.getByText("Por que Orbien")).toBeInTheDocument();
    expect(screen.getByText("Sua igreja entra hoje.")).toBeInTheDocument();
    expect(screen.getByText("O app é seu, não nosso.")).toBeInTheDocument();
    expect(
      screen.getByText("Você vê o que está acontecendo.")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sem CNPJ, sem instalação, sem treinamento/)
    ).toBeInTheDocument();
  });
});

describe("Modules", () => {
  it("ancora em #modulos e leva cada módulo à sua página", () => {
    const { container } = render(<Modules />);

    expect(container.querySelector("section")).toHaveAttribute("id", "modulos");
    expect(screen.getByText("Funcionalidades")).toBeInTheDocument();

    const destinos = [
      ["Membros e visitantes", "/funcionalidades/membros"],
      ["Doações e finanças", "/funcionalidades/financeiro"],
      ["Pequenos grupos", "/funcionalidades/pequenos-grupos"],
      ["Conteúdo e notificações", "/funcionalidades/conteudos"],
    ] as const;

    for (const [titulo, href] of destinos) {
      const cartao = screen.getByText(titulo).closest("a")!;
      expect(cartao).toHaveAttribute("href", href);
      expect(within(cartao).getByText(/Ver módulo/)).toBeInTheDocument();
    }
  });
});

describe("Comparison", () => {
  it("ancora em #comparativo e compara as cinco linhas", () => {
    const { container } = render(<Comparison />);

    expect(container.querySelector("section")).toHaveAttribute(
      "id",
      "comparativo"
    );
    expect(screen.getByText("Comparativo")).toBeInTheDocument();
    expect(
      screen.getByText(/Sem nomes — só os detalhes que importam/)
    ).toBeInTheDocument();

    // Cada linha aparece duas vezes: uma no layout de mesa, outra no
    // empilhado do mobile.
    for (const item of [
      "Exige CNPJ",
      "App nas lojas",
      "PIX com recibo automático",
      "UX",
      "Tempo pra começar",
    ]) {
      expect(screen.getAllByText(item)).toHaveLength(2);
    }
    expect(screen.getAllByText("Starter já tem")).toHaveLength(4);
    expect(screen.getAllByText("Mobile-first")).toHaveLength(2);
  });
});

describe("PricingSection", () => {
  it("ancora em #precos e mostra os dois planos com preço e destaques", () => {
    const { container } = render(<PricingSection />);

    expect(container.querySelector("section")).toHaveAttribute("id", "precos");
    expect(screen.getByText("Starter")).toBeInTheDocument();
    expect(screen.getByText("R$ 59")).toBeInTheDocument();
    expect(screen.getByText("Sem CNPJ? Comece aqui.")).toBeInTheDocument();
    expect(screen.getByText("PIX por chave manual")).toBeInTheDocument();

    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(screen.getByText("R$ 99")).toBeInTheDocument();
    expect(
      screen.getByText("PIX dinâmico com recibo automático")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Forecast, DRE e exportação contábil")
    ).toBeInTheDocument();
  });

  it("todos os caminhos de preço levam a /precos", () => {
    render(<PricingSection />);

    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toContain("/precos");
    }
  });
});

describe("FaqSection", () => {
  it("ancora em #faq, traz as quatro perguntas e o atalho para o resto", () => {
    const { container } = render(<FaqSection />);

    expect(container.querySelector("section")).toHaveAttribute("id", "faq");
    expect(
      screen.getByText("A Orbien funciona pra qualquer denominação?")
    ).toBeInTheDocument();
    expect(screen.getByText("Preciso ter CNPJ pra usar?")).toBeInTheDocument();
    expect(screen.getByText("Tem trial gratuito?")).toBeInTheDocument();
    expect(
      screen.getByText("Onde os dados ficam guardados?")
    ).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(4);
    expect(
      screen.getByRole("link", { name: "Ver todas as perguntas →" })
    ).toHaveAttribute("href", "/precos#faq");
  });

  it("as respostas dizem o essencial de cada objeção", () => {
    render(<FaqSection />);

    expect(screen.getByText(/confessional-neutro/)).toBeInTheDocument();
    expect(
      screen.getByText(/a doação por PIX cai direto na chave da igreja/)
    ).toBeInTheDocument();
    expect(screen.getByText(/14 dias do Premium/)).toBeInTheDocument();
    expect(
      screen.getByText(/servidores no Brasil \(São Paulo\), em conformidade com a LGPD/)
    ).toBeInTheDocument();
  });
});

describe("Credibility", () => {
  it("mostra a frase de posicionamento e onde o produto está sendo feito", () => {
    render(<Credibility />);

    expect(
      screen.getByText(/Feito com pastores, para pastores\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Em desenvolvimento com igrejas de Passo Fundo · RS/)
    ).toBeInTheDocument();
  });
});

describe("FinalCta", () => {
  it("é a âncora #waitlist e oferece os dois caminhos de contato", () => {
    const { container } = render(<FinalCta />);

    expect(container.querySelector("section")).toHaveAttribute("id", "waitlist");
    expect(screen.getByText("Lista de espera aberta")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Pronto pra ver na sua igreja?" })
    ).toBeInTheDocument();

    const whatsapp = screen.getByRole("link", { name: /Fale no WhatsApp/ });
    expect(whatsapp).toHaveAttribute("href", "https://wa.me/5554999529683");
    expect(whatsapp).toHaveAttribute("target", "_blank");
    expect(whatsapp).toHaveAttribute("rel", "noopener noreferrer");
  });
});
