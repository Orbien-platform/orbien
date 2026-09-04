import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, badgeVariants } from "./badge";

describe("Badge", () => {
  it("renderiza como span com variant default", () => {
    render(<Badge>Novo</Badge>);
    const el = screen.getByText("Novo");
    expect(el.tagName).toBe("SPAN");
    expect(el.className).toContain("bg-primary");
  });

  it("aplica a classe da variant destructive", () => {
    render(<Badge variant="destructive">Erro</Badge>);
    expect(screen.getByText("Erro").className).toContain("text-destructive");
  });

  it("mescla className customizada", () => {
    render(<Badge className="ml-2">Tag</Badge>);
    expect(screen.getByText("Tag").className).toContain("ml-2");
  });

  it("badgeVariants gera as classes esperadas por variant", () => {
    expect(badgeVariants({ variant: "outline" })).toContain("border-border");
    expect(badgeVariants({})).toContain("bg-primary");
  });
});
