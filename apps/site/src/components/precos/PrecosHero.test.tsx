import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrecosHero } from "@/components/precos/PrecosHero";

describe("PrecosHero", () => {
  it("anuncia a seção pelo título", () => {
    render(<PrecosHero />);
    expect(screen.getByRole("heading", { name: /Dois planos\. O preço cresce com a sua igreja\./ })).toBeInTheDocument();
  });

  it("traz o rótulo da seção", () => {
    render(<PrecosHero />);
    expect(screen.getByText("Planos e preços")).toBeInTheDocument();
  });
});
