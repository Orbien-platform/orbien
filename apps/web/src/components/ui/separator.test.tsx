import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./separator";

describe("Separator", () => {
  it("renderiza horizontal por padrão", () => {
    const { container } = render(<Separator />);
    const el = container.querySelector('[data-slot="separator"]');
    expect(el).toHaveAttribute("data-orientation", "horizontal");
  });

  it("aceita orientação vertical", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const el = container.querySelector('[data-slot="separator"]');
    expect(el).toHaveAttribute("data-orientation", "vertical");
  });

  it("mescla className customizada", () => {
    const { container } = render(<Separator className="my-4" />);
    const el = container.querySelector('[data-slot="separator"]');
    expect(el?.className).toContain("my-4");
    expect(el?.className).toContain("bg-border");
  });
});
