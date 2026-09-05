import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionLabel } from "@/components/ui/SectionLabel";

describe("SectionLabel", () => {
  it("mostra o texto e pinta o traço com a cor padrão", () => {
    const { container } = render(<SectionLabel>Comparativo</SectionLabel>);
    expect(screen.getByText("Comparativo")).toBeInTheDocument();
    const line = container.querySelector("span")!;
    expect(line).toHaveStyle({ background: "var(--navy-accent)" });
  });

  it("lineColor sobrescreve só o traço, não o texto", () => {
    const { container } = render(
      <SectionLabel color="var(--stone)" lineColor="var(--muted)">
        Igrejas-piloto
      </SectionLabel>
    );
    expect(container.firstElementChild).toHaveStyle({ color: "var(--stone)" });
    expect(container.querySelector("span")).toHaveStyle({ background: "var(--muted)" });
  });

  it("aceita className extra", () => {
    const { container } = render(<SectionLabel className="mb-6">Rótulo</SectionLabel>);
    expect(container.firstElementChild!.className).toContain("mb-6");
  });
});
