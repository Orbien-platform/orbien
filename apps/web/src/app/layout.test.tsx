import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import RootLayout from "./layout";

// next/font/local não é executável fora do compilador do Next — precisa de
// mock, assim como o layout raiz do site fez na Fase 12 (mesmo padrão). O
// mock devolve a variável que o layout pediu, para o teste pegar nome trocado.
vi.mock("next/font/local", () => ({
  default: ({ variable }: { variable: string }) => ({ variable }),
}));

// AuthProvider já tem cobertura própria (Fase 7, contexts/AuthContext.test.tsx)
// — aqui ele é ruído: dispara uma chamada axios real que este teste não quer
// mockar de novo.
vi.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeAll(() => {
  // jsdom não implementa matchMedia; next-themes usa para detectar o tema do SO.
  window.matchMedia =
    window.matchMedia ??
    ((query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList);
});

describe("RootLayout", () => {
  it("renderiza os children dentro dos providers", () => {
    // <html>/<body> não são válidos como filho do container de teste — jsdom
    // reclama de hidratação, mas o que importa aqui é que a árvore de
    // providers (tema, auth mockado, tooltip) entrega os children.
    render(RootLayout({ children: <span>Conteúdo</span> }));
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
  });
});
