import { render } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { Reveal } from "@/components/ui/Reveal";
import { intersectionObservers } from "../../../vitest.setup";

function lastObserver() {
  return intersectionObservers[intersectionObservers.length - 1];
}

function entryFor(el: Element, isIntersecting: boolean) {
  return { target: el, isIntersecting } as unknown as IntersectionObserverEntry;
}

describe("Reveal", () => {
  beforeEach(() => {
    intersectionObservers.length = 0;
  });

  it("renderiza os filhos com a classe base e a className extra", () => {
    const { container } = render(<Reveal className="mb-12">conteúdo</Reveal>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toBe("reveal mb-12");
    expect(div).toHaveTextContent("conteúdo");
  });

  it("observa o próprio elemento ao montar", () => {
    const { container } = render(<Reveal>x</Reveal>);
    expect(lastObserver().observed).toEqual([container.firstElementChild]);
  });

  it('marca "in" e para de observar quando o elemento entra na viewport', () => {
    const { container } = render(<Reveal>x</Reveal>);
    const el = container.firstElementChild as HTMLElement;
    const obs = lastObserver();

    act(() => {
      obs.callback([entryFor(el, true)], obs as unknown as IntersectionObserver);
    });

    expect(el.classList.contains("in")).toBe(true);
    expect(obs.unobserved).toEqual([el]);
  });

  it("não marca nada enquanto o elemento está fora da viewport", () => {
    const { container } = render(<Reveal>x</Reveal>);
    const el = container.firstElementChild as HTMLElement;
    const obs = lastObserver();

    act(() => {
      obs.callback([entryFor(el, false)], obs as unknown as IntersectionObserver);
    });

    expect(el.classList.contains("in")).toBe(false);
    expect(obs.unobserved).toEqual([]);
  });

  // O guard `if (!el) return` do efeito é o único ramo não coberto deste
  // arquivo: o React sempre preenche `ref.current` antes do efeito rodar,
  // então `el` nunca é null pela UI real. Ver o threshold de
  // `src/components/ui/**` em `vitest.config.ts`.
  it("desconecta o observer ao desmontar", () => {
    const { unmount } = render(<Reveal>x</Reveal>);
    const obs = lastObserver();
    unmount();
    expect(obs.disconnected).toBe(true);
  });
});
