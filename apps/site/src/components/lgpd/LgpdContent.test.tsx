import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LgpdContent } from "./LgpdContent";

describe("LgpdContent", () => {
  it("identifica a política, a versão e a lei que a rege", () => {
    render(<LgpdContent />);

    expect(screen.getByText("Legal e privacidade")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Política de Privacidade e LGPD"
    );
    expect(
      screen.getByText(/Versão 1\.0 · Última atualização: junho de 2026/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Lei nº 13\.709\/2018 — LGPD/)
    ).toBeInTheDocument();
  });

  it("traz as dez seções da política, na ordem", () => {
    render(<LgpdContent />);

    const titulos = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);

    expect(titulos).toEqual([
      "1. Controlador e Operador",
      "2. Dados coletados",
      "3. Bases legais para o tratamento",
      "4. Encarregado de Dados (DPO)",
      "5. Direitos dos titulares",
      "6. Compartilhamento de dados",
      "7. Retenção e exclusão",
      "8. Segurança",
      "9. Alterações nesta política",
      "10. Contato",
    ]);
  });

  it("deixa claro quem é controlador e quem é operador", () => {
    render(<LgpdContent />);

    expect(screen.getByText("Controlador dos dados:")).toBeInTheDocument();
    expect(
      screen.getByText(/A sua igreja \(pessoa jurídica ou representante legal\)/)
    ).toBeInTheDocument();
    expect(screen.getByText("Operador dos dados:")).toBeInTheDocument();
    expect(
      screen.getByText(/processa os dados em nome da igreja/)
    ).toBeInTheDocument();
  });

  it("lista as categorias de dado coletado, sem dado bancário do doador", () => {
    render(<LgpdContent />);

    expect(
      screen.getByText(/Identificação: nome completo, telefone, e-mail/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/sem dados bancários do doador/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Técnicos: endereço IP, tipo de dispositivo/)
    ).toBeInTheDocument();
  });

  it("nomeia o encarregado, o canal e o prazo de resposta", () => {
    render(<LgpdContent />);

    expect(screen.getByText("Church Platform Ltda — DPO")).toBeInTheDocument();
    for (const link of screen.getAllByRole("link", {
      name: "privacidade@orbien.app",
    })) {
      expect(link).toHaveAttribute("href", "mailto:privacidade@orbien.app");
    }
    expect(
      screen.getByText(/prazo de resposta é de até 15 dias corridos/)
    ).toBeInTheDocument();
  });

  it("aponta para a ANPD em nova aba", () => {
    render(<LgpdContent />);

    const anpd = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href")?.includes("gov.br/anpd"))!;
    expect(anpd).toBeDefined();
    expect(anpd).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});
