import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import RootLayout, { metadata } from "./layout";

// `next/font/google` só existe sob o build do Next: fora dele o import
// quebra. O que o layout usa do retorno é a `variable` da fonte.
vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ variable: "--font-dm-sans" }),
  DM_Mono: () => ({ variable: "--font-dm-mono" }),
}));

vi.mock("./globals.css", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { user: null } }),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeAll(() => {
  // jsdom não implementa matchMedia; next-themes usa para ler o tema do SO.
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
  it("declara os metadados da aplicação", () => {
    expect(metadata.title).toBe("Orbien");
    expect(metadata.description).toBe("Plataforma de gestão para igrejas");
  });

  it("monta <html lang=pt-BR> com as variáveis de fonte", () => {
    // Server Component sem `async`: invocável como função. Renderizar
    // <html> dentro do container do jsdom não faz sentido, então a asserção
    // é sobre o elemento retornado.
    const tree = RootLayout({ children: <p>conteúdo</p> }) as ReactElement<{
      lang: string;
      className: string;
      suppressHydrationWarning: boolean;
      children: ReactElement;
    }>;

    expect(tree.type).toBe("html");
    expect(tree.props.lang).toBe("pt-BR");
    expect(tree.props.className).toContain("--font-dm-sans");
    expect(tree.props.className).toContain("--font-dm-mono");
    expect(tree.props.suppressHydrationWarning).toBe(true);
  });

  it("renderiza os filhos dentro dos providers de tema, sessão e tooltip", () => {
    const tree = RootLayout({ children: <p>conteúdo</p> }) as ReactElement<{
      children: ReactElement;
    }>;

    // `tree.props.children` é o <body>; renderizá-lo sozinho já exercita a
    // cadeia de providers.
    render(tree.props.children);

    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });
});
