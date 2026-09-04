import "@testing-library/jest-dom/vitest";

/**
 * jsdom não implementa IntersectionObserver, e `components/ui/Reveal.tsx`
 * embrulha praticamente toda seção do site — sem este stub qualquer render
 * de página quebra com `ReferenceError` no efeito do Reveal.
 *
 * O stub entrega o elemento como visível assim que é observado, que é o que
 * o navegador faz para conteúdo já dentro da viewport. Assim o caminho
 * "revelou" é o testado por padrão; o caminho "fora da viewport" é exercido
 * pelos testes do próprio Reveal, que substituem o global.
 */
class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element): void {
    this.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this,
    );
  }

  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver =
  ImmediateIntersectionObserver as unknown as typeof IntersectionObserver;
