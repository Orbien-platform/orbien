import "@testing-library/jest-dom/vitest";

/**
 * `IntersectionObserver` não existe no jsdom, e o `Reveal` — que embrulha
 * quase toda seção do site — o instancia na montagem. Sem este dublê,
 * renderizar qualquer página quebra antes da primeira asserção.
 *
 * O comportamento do próprio `Reveal` (marcar `in` ao entrar na tela) é
 * testado em `src/components/ui/ui.test.tsx`, que substitui este global por
 * um dublê controlável.
 */
class ObservadorDeInterseccaoInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: number[] = [];
}

globalThis.IntersectionObserver =
  ObservadorDeInterseccaoInerte as unknown as typeof IntersectionObserver;
