import type { ReactElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { redirect, useRouter } from "next/navigation";
import RootLayout, { metadata } from "./layout";
import RootPage from "./page";
import PlatformLayout from "./(platform)/layout";
import { useAuth } from "@/hooks/useAuth";
import { saveTokens, getAccessToken } from "@/lib/auth";

vi.mock("next/font/google", () => ({
  DM_Sans: () => ({ variable: "--font-dm-sans" }),
  DM_Mono: () => ({ variable: "--font-dm-mono" }),
}));
vi.mock("./globals.css", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <nav>sidebar</nav>,
}));
vi.mock("@/components/layout/header", () => ({
  Header: () => <header>header</header>,
}));

const replace = vi.fn();

function comSessao({
  isAuthenticated,
  isLoading,
}: {
  isAuthenticated: boolean;
  isLoading: boolean;
}) {
  vi.mocked(useAuth).mockReturnValue({
    user: isAuthenticated
      ? {
          id: "u-1",
          name: "suporte",
          email: "suporte@orbien.app",
          roles: ["platform_support"],
        }
      : null,
    isLoading,
    isAuthenticated,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

beforeAll(() => {
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

beforeEach(() => {
  localStorage.clear();
  replace.mockReset();
  vi.mocked(redirect).mockReset();
  vi.mocked(useRouter).mockReturnValue({
    replace,
  } as unknown as ReturnType<typeof useRouter>);
  comSessao({ isAuthenticated: true, isLoading: false });
});

describe("RootLayout", () => {
  it("identifica o app como console da plataforma", () => {
    expect(metadata.title).toBe("Orbien — Plataforma");
    expect(metadata.description).toBe(
      "Console de administração da plataforma Orbien"
    );
  });

  it("monta <html lang=pt-BR> com as variáveis de fonte", () => {
    const arvore = RootLayout({ children: <p>conteúdo</p> }) as ReactElement<{
      lang: string;
      className: string;
      suppressHydrationWarning: boolean;
      children: ReactElement;
    }>;

    expect(arvore.type).toBe("html");
    expect(arvore.props.lang).toBe("pt-BR");
    expect(arvore.props.className).toContain("--font-dm-sans");
    expect(arvore.props.className).toContain("--font-dm-mono");
    expect(arvore.props.suppressHydrationWarning).toBe(true);
  });

  it("renderiza os filhos sob os providers de tema e sessão", () => {
    const arvore = RootLayout({ children: <p>conteúdo</p> }) as ReactElement<{
      children: ReactElement;
    }>;

    render(arvore.props.children);

    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });
});

describe("RootPage", () => {
  it("manda a raiz para a lista de tenants", () => {
    RootPage();

    expect(vi.mocked(redirect)).toHaveBeenCalledWith("/tenants");
  });
});

describe("PlatformLayout", () => {
  it("com sessão válida monta sidebar, header e o conteúdo", () => {
    render(<PlatformLayout>conteúdo da tela</PlatformLayout>);

    expect(screen.getByText("sidebar")).toBeInTheDocument();
    expect(screen.getByText("header")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("conteúdo da tela");
    expect(replace).not.toHaveBeenCalled();
  });

  it("enquanto a sessão hidrata, mostra o spinner e não decide nada", () => {
    comSessao({ isAuthenticated: false, isLoading: true });

    const { container } = render(<PlatformLayout>conteúdo</PlatformLayout>);

    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.queryByText("sidebar")).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("sem sessão manda para o login", async () => {
    comSessao({ isAuthenticated: false, isLoading: false });

    render(<PlatformLayout>conteúdo</PlatformLayout>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("sidebar")).not.toBeInTheDocument();
  });

  it("token guardado sem acesso de plataforma é apagado antes do redirect", async () => {
    // O `proxy.ts` barra quem chega sem cookie; este é o outro caminho —
    // cookie presente com token de outro papel. Sem limpar, a próxima visita
    // repetiria o redirect para sempre.
    saveTokens("at-de-outro-papel", "rt-1", "admin@igreja.com");
    comSessao({ isAuthenticated: false, isLoading: false });

    render(<PlatformLayout>conteúdo</PlatformLayout>);

    await waitFor(() => expect(getAccessToken()).toBeNull());
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
