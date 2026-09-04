import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "./HowItWorks";
import { PixFlow } from "./PixFlow";
import { SemCnpjFaq } from "./SemCnpjFaq";
import { SemCnpjHero } from "./SemCnpjHero";
import { StarterIncludes } from "./StarterIncludes";
import { UpgradePath } from "./UpgradePath";

describe("SemCnpjHero", () => {
  it("promete começar hoje e formalizar depois", () => {
    render(<SemCnpjHero />);

    expect(screen.getByText("Para igrejas sem CNPJ")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Comece hoje. Formalize depois."
    );
    expect(
      screen.getByText(/PIX cai direto na chave da sua igreja/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Entrar na lista de espera/ })
    ).toHaveAttribute("href", "#waitlist");
  });

  it("o mockup mostra a doação caindo na chave da igreja, sem intermediação", () => {
    render(<SemCnpjHero />);

    expect(screen.getByText("Última doação recebida")).toBeInTheDocument();
    expect(screen.getByText("250,00")).toBeInTheDocument();
    expect(screen.getByText("Chave PIX da Igreja")).toBeInTheDocument();
    expect(
      screen.getByText("Orbien não intermediou esta transação")
    ).toBeInTheDocument();
  });
});

describe("HowItWorks", () => {
  it("descreve os três passos, na ordem", () => {
    render(<HowItWorks />);

    expect(
      screen.getByRole("heading", { name: "Três passos e sua igreja está no ar." })
    ).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("Crie sua conta em 5 minutos")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("Configure sua chave PIX")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("Sua igreja já está no ar")).toBeInTheDocument();
    expect(
      screen.getByText(/a Orbien não é intermediária e não toca em nenhum centavo/)
    ).toBeInTheDocument();
  });
});

describe("PixFlow", () => {
  it("explica o caminho do dinheiro e o papel da Orbien", () => {
    render(<PixFlow />);

    expect(
      screen.getByRole("heading", { name: "O dinheiro vai direto pra sua igreja." })
    ).toBeInTheDocument();
    expect(screen.getByText("PIX cai direto na sua chave")).toBeInTheDocument();
    expect(
      screen.getByText("Recibo automático para o doador")
    ).toBeInTheDocument();
    expect(screen.getByText("Orbien não é intermediária")).toBeInTheDocument();
    expect(
      screen.getByText(/Não há taxa sobre as doações/)
    ).toBeInTheDocument();
  });

  it("o diagrama mostra a doação indo do membro à chave da igreja", () => {
    render(<PixFlow />);

    expect(screen.getByText("Membro faz doação")).toBeInTheDocument();
    expect(screen.getByText("R$ 150,00")).toBeInTheDocument();
    expect(screen.getByText("Chave PIX da Igreja")).toBeInTheDocument();
    expect(
      screen.getByText("Orbien não intermediou — recibo gerado automaticamente")
    ).toBeInTheDocument();
  });
});

describe("StarterIncludes", () => {
  it("lista os quatro módulos disponíveis sem CNPJ", () => {
    render(<StarterIncludes />);

    expect(
      screen.getByRole("heading", { name: "O que está incluído sem CNPJ." })
    ).toBeInTheDocument();
    expect(screen.getByText("Membros e visitantes")).toBeInTheDocument();
    expect(screen.getByText("Doações via PIX")).toBeInTheDocument();
    expect(screen.getByText("Pequenos grupos")).toBeInTheDocument();
    expect(screen.getByText("Avisos e devocionais")).toBeInTheDocument();
    expect(screen.getAllByText("Incluído no Starter")).toHaveLength(3);
    expect(screen.getByText("Sem taxa sobre doações")).toBeInTheDocument();
  });
});

describe("UpgradePath", () => {
  it("mostra o que muda na formalização e o que o Premium desbloqueia", () => {
    render(<UpgradePath />);

    expect(
      screen.getByRole("heading", {
        name: "A formalização chegou? A migração leva 15 minutos.",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText("CNPJ registrado no cadastro da igreja")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chave PIX migrada para o CNPJ")
    ).toBeInTheDocument();
    expect(screen.getByText("O que desbloqueia no Premium")).toBeInTheDocument();
    expect(
      screen.getByText("Dízimo recorrente automático via PIX")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Ver plano Premium/ })
    ).toHaveAttribute("href", "/precos");
  });
});

describe("SemCnpjFaq", () => {
  it("responde as seis dúvidas de quem não tem CNPJ", () => {
    const { container } = render(<SemCnpjFaq />);

    expect(
      screen.getByRole("heading", {
        name: "As perguntas que toda igreja sem CNPJ faz.",
      })
    ).toBeInTheDocument();
    expect(container.querySelectorAll("details")).toHaveLength(6);

    expect(
      screen.getByText("A Orbien fica com alguma porcentagem das doações?")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/o que o membro doa vai 100% pra sua igreja/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/é necessário o plano Premium, que exige CNPJ/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver todas as perguntas →" })
    ).toHaveAttribute("href", "/precos#faq");
  });
});
