import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingSection } from "@/components/home/PricingSection";

describe("PricingSection", () => {
  it("anuncia a seção pelo título", () => {
    render(<PricingSection />);
    expect(screen.getByRole("heading", { name: /Dois planos\. O preço cresce com a sua igreja\./ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<PricingSection />);
    expect(screen.getByText("Planos")).toBeInTheDocument();
  });

  it("manda os dois planos para a tabela de preços", () => {
    render(<PricingSection />);
    const links = screen.getAllByRole("link", { name: /Ver plano completo/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/precos");
    }
  });
});
