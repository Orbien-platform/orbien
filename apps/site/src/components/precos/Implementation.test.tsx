import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Implementation } from "@/components/precos/Implementation";

describe("Implementation", () => {
  it("anuncia a seção pelo título", () => {
    render(<Implementation />);
    expect(screen.getByRole("heading", { name: /Implantação — pagamento único na contratação/ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<Implementation />);
    for (const texto of [
      "Plano Starter",
      "Plano Premium",
      "Vindo de outro sistema",
      "Migração assistida",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
