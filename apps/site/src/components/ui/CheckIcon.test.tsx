import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckIcon } from "@/components/ui/CheckIcon";

function iconOf(container: HTMLElement) {
  return container.firstElementChild as HTMLElement;
}

describe("CheckIcon", () => {
  it("usa o tamanho md por padrão", () => {
    const { container } = render(<CheckIcon />);
    const span = iconOf(container);
    expect(span.className).toContain("w-[18px]");
    expect(container.querySelector("svg")).toHaveAttribute("width", "10");
  });

  it('encolhe o svg no tamanho "sm"', () => {
    const { container } = render(<CheckIcon size="sm" />);
    const span = iconOf(container);
    expect(span.className).toContain("w-3.5");
    expect(container.querySelector("svg")).toHaveAttribute("width", "8");
  });

  it("anexa a className recebida sem perder as classes de tamanho", () => {
    const { container } = render(<CheckIcon className="mt-1" />);
    const span = iconOf(container);
    expect(span.className).toContain("w-[18px]");
    expect(span.className).toContain("mt-1");
  });

  it("sem className não deixa espaço sobrando no atributo", () => {
    const { container } = render(<CheckIcon />);
    expect(iconOf(container).className.endsWith(" ")).toBe(false);
  });
});
