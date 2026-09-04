import "@testing-library/jest-dom/vitest";

/**
 * jsdom não implementa IntersectionObserver, e `ui/Reveal.tsx` — usado por
 * quase toda seção do site — instancia um no mount. Sem este stub qualquer
 * render quebraria com ReferenceError.
 *
 * As instâncias ficam em `intersectionObservers` para que o teste do próprio
 * `Reveal` possa disparar o callback à mão; os demais testes só precisam que
 * o construtor exista.
 */
export interface FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  observed: Element[];
  unobserved: Element[];
  disconnected: boolean;
}

export const intersectionObservers: FakeIntersectionObserver[] = [];

class IntersectionObserverStub implements FakeIntersectionObserver {
  callback: IntersectionObserverCallback;
  observed: Element[] = [];
  unobserved: Element[] = [];
  disconnected = false;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    intersectionObservers.push(this);
  }

  observe(el: Element) {
    this.observed.push(el);
  }

  unobserve(el: Element) {
    this.unobserved.push(el);
  }

  disconnect() {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

Object.defineProperty(globalThis, "IntersectionObserver", {
  writable: true,
  configurable: true,
  value: IntersectionObserverStub,
});
