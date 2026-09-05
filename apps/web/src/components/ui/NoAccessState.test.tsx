import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoAccessState } from "./NoAccessState";

describe("NoAccessState", () => {
  it("nomeia a área e diz o que fazer", () => {
    render(<NoAccessState resource="Financeiro" />);

    expect(screen.getByText("Você não tem acesso a Financeiro.")).toBeInTheDocument();
    expect(screen.getByText(/Fale com um\s+administrador/)).toBeInTheDocument();
  });

  it("se anuncia como status, e não como erro", () => {
    // Não é falha: é a resposta do servidor lida corretamente.
    render(<NoAccessState resource="Pessoas" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
