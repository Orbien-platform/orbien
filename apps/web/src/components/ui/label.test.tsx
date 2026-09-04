import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Label } from "./label";

describe("Label", () => {
  it("renderiza o texto e associa via htmlFor", () => {
    render(
      <>
        <Label htmlFor="email">E-mail</Label>
        <input id="email" />
      </>
    );
    const label = screen.getByText("E-mail");
    expect(label.tagName).toBe("LABEL");
    expect(label).toHaveAttribute("for", "email");
  });

  it("mescla className customizada", () => {
    render(<Label className="text-red-500">Nome</Label>);
    expect(screen.getByText("Nome")).toHaveClass("text-red-500");
  });
});
