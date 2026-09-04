import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrincipiosSection } from "@/components/sobre/PrincipiosSection";

describe("PrincipiosSection", () => {
  it("anuncia a seção pelo título", () => {
    render(<PrincipiosSection />);
    expect(screen.getByRole("heading", { name: /Quatro princípios que guiam tudo\./ })).toBeInTheDocument();
  });

  it("mostra o conteúdo da seção", () => {
    render(<PrincipiosSection />);
    for (const texto of [
      "Rigor sem frieza",
      "Construído com pastores",
      "Transparência radical",
      "Mobile-first, sempre",
    ]) {
      expect(screen.getByText(texto)).toBeInTheDocument();
    }
  });
});
