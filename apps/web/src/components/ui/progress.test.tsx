import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress, ProgressLabel, ProgressValue } from "./progress";

describe("Progress", () => {
  it("renderiza a track e o indicator com o valor informado", () => {
    const { container } = render(<Progress value={40} aria-label="Progresso" />);
    const root = container.querySelector('[data-slot="progress"]');
    expect(root).toBeInTheDocument();
    expect(container.querySelector('[data-slot="progress-track"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="progress-indicator"]')).toBeInTheDocument();
  });

  it("renderiza label e value quando passados como children", () => {
    render(
      <Progress value={75} aria-label="Progresso">
        <ProgressLabel>Concluído</ProgressLabel>
        <ProgressValue />
      </Progress>
    );
    expect(screen.getByText("Concluído")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("mescla className customizada no root", () => {
    const { container } = render(<Progress value={10} aria-label="P" className="mt-2" />);
    expect(container.querySelector('[data-slot="progress"]')?.className).toContain("mt-2");
  });
});
