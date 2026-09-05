import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LgpdPage, { metadata } from "./page";

describe("LgpdPage", () => {
  it("renderiza o header, o footer e o título da política", () => {
    render(<LgpdPage />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: /Política de Privacidade e LGPD/ }),
    ).toBeInTheDocument();
  });

  it("lista as dez cláusulas na ordem numerada", () => {
    render(<LgpdPage />);

    const clausulas = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.trim());

    expect(clausulas).toEqual([
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

  it("declara o título e a descrição da rota", () => {
    expect(metadata.title).toBe("Política de Privacidade e LGPD");
    expect(metadata.description).toContain("LGPD");
  });
});
