// Espelho da spec de mesmo nome no `apps/web`: o componente é byte a byte
// idêntico nos dois apps (copiado de lá quando o console nasceu). Enquanto
// forem duplicatas, as specs também são — se um dia virarem um pacote
// compartilhado, esta some junto.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renderiza um div com a animação de pulso", () => {
    const { container } = render(<Skeleton data-testid="skel" />);
    const el = container.querySelector('[data-slot="skeleton"]');
    expect(el).not.toBeNull();
    expect(el?.className).toContain("animate-pulse");
  });

  it("mescla className customizada mantendo as classes padrão", () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    const el = container.querySelector('[data-slot="skeleton"]');
    expect(el?.className).toContain("h-4");
    expect(el?.className).toContain("w-32");
    expect(el?.className).toContain("rounded-md");
  });

  it("repassa props arbitrárias para o elemento", () => {
    const { getByTestId } = render(<Skeleton data-testid="skel" />);
    expect(getByTestId("skel")).toBeInTheDocument();
  });
});
