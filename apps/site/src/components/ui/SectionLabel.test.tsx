import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionLabel } from "@/components/ui/SectionLabel";

describe("SectionLabel", () => {
  it("mostra o texto e pinta o traço com a cor padrão", () => {
    const { container } = render(<SectionLabel>Comparativo</SectionLabel>);
    expect(screen.getByText("Comparativo")).toBeInTheDocument();
    const line = container.querySelector("span")!;
    expect(line).toHaveStyle({ background: "var(--color-teal)" });
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

  it("usa a tipografia de rótulo da Órbita: mono, caixa alta, espaçada", () => {
    const { container } = render(<SectionLabel>Rótulo</SectionLabel>);
    const cls = container.firstElementChild!.className;
    expect(cls).toContain("font-mono");
    expect(cls).toContain("uppercase");
    expect(cls).toContain("tracking-[0.16em]");
  });

  it("aceita className extra", () => {
    const { container } = render(<SectionLabel className="mb-6">Rótulo</SectionLabel>);
    expect(container.firstElementChild!.className).toContain("mb-6");
  });
});
