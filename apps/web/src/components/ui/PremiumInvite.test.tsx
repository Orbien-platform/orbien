import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PremiumInvite } from "./PremiumInvite";

describe("PremiumInvite", () => {
  it("diz que a área é Premium, o que ela faz e leva aos planos", () => {
    render(<PremiumInvite resource="Auditoria" description="Veja quem acessou o quê." />);

    expect(
      screen.getByRole("region", { name: "Auditoria — disponível no plano Premium" })
    ).toBeInTheDocument();
    expect(screen.getByText("Disponível no plano Premium")).toBeInTheDocument();
    expect(screen.getByText("Veja quem acessou o quê.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Conhecer o Premium" });
    expect(link).toHaveAttribute("href", "https://useorbien.com/precos");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
