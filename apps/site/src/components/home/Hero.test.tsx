import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Hero } from "@/components/home/Hero";

describe("Hero", () => {
  it("abre com a promessa da home", () => {
    render(<Hero />);
    expect(screen.getByText("Plataforma de gestão para igrejas")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /A plataforma de gestão que cabe na sua igreja\./ })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Membros, finanças, células e app próprio nas lojas/)
    ).toBeInTheDocument();
  });

  it("leva o CTA principal para a lista de espera e o secundário para os pilares", () => {
    render(<Hero />);
    expect(screen.getByRole("link", { name: "Entrar na lista de espera" })).toHaveAttribute("href", "#waitlist");
    expect(screen.getByRole("link", { name: "Ver como funciona" })).toHaveAttribute("href", "#pilares");
  });

  it("lista os selos de entrada sem atrito", () => {
    render(<Hero />);
    for (const selo of ["SEM CNPJ", "SEM CARTÃO", "5 MIN PARA COMEÇAR"]) {
      expect(screen.getByText(selo)).toBeInTheDocument();
    }
  });

  it("mostra o mockup do painel com os KPIs da semana", () => {
    render(<Hero />);
    expect(screen.getByText("orbien.app/painel")).toBeInTheDocument();
    expect(screen.getByText("Olá, Pastor André")).toBeInTheDocument();
    for (const kpi of ["Doações", "Visitantes", "Células ativas"]) {
      expect(screen.getByText(kpi)).toBeInTheDocument();
    }
  });

  it("mostra o mockup do celular com o formulário de visitante", () => {
    render(<Hero />);
    expect(screen.getAllByText("Cadastrar visitante").length).toBe(2);
    expect(screen.getByText("Nome")).toBeInTheDocument();
    expect(screen.getByText("João Pedro Souza")).toBeInTheDocument();
    expect(screen.getByText("Como conheceu")).toBeInTheDocument();
  });

  it("destaca só o campo em foco no mockup", () => {
    render(<Hero />);
    const emFoco = screen.getByText("WhatsApp").parentElement!;
    const semFoco = screen.getByText("Nome").parentElement!;
    expect(emFoco.getAttribute("style")).toContain("box-shadow");
    expect(semFoco.getAttribute("style")).not.toContain("box-shadow");
  });
});
