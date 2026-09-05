import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Header } from "./header";
import { Sidebar, navItems } from "./sidebar";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { useAuth } from "@/hooks/useAuth";

vi.mock("next/navigation", () => ({ usePathname: vi.fn() }));
vi.mock("next-themes", async () => {
  const real = await vi.importActual<typeof import("next-themes")>("next-themes");
  return { ...real, useTheme: vi.fn() };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const setTheme = vi.fn();
const logout = vi.fn();

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

function comSessao(email: string | null) {
  vi.mocked(useAuth).mockReturnValue({
    user: email
      ? { id: "u-1", name: "suporte", email, roles: ["platform_support"] }
      : null,
    isLoading: false,
    isAuthenticated: !!email,
    login: vi.fn(),
    logout,
  });
}

beforeEach(() => {
  setTheme.mockReset();
  logout.mockReset();
  vi.mocked(useTheme).mockReturnValue({
    theme: "light",
    setTheme,
  } as unknown as ReturnType<typeof useTheme>);
  vi.mocked(usePathname).mockReturnValue("/tenants");
  comSessao("suporte@orbien.app");
});

describe("Sidebar", () => {
  it("identifica o console como plataforma, não como igreja", () => {
    render(<Sidebar />);

    expect(screen.getByText("orbien")).toBeInTheDocument();
    // O console não está dentro de tenant nenhum — é o que habilita as
    // rotas de plataforma.
    expect(screen.getByText("Plataforma")).toBeInTheDocument();
  });

  it("lista as três rotas do console", () => {
    render(<Sidebar />);

    expect(navItems.map((i) => i.href)).toEqual([
      "/tenants",
      "/waitlist",
      "/auditoria",
    ]);
    expect(screen.getByRole("link", { name: /Tenants/ })).toHaveAttribute(
      "href",
      "/tenants"
    );
    expect(screen.getByRole("link", { name: /Waitlist/ })).toHaveAttribute(
      "href",
      "/waitlist"
    );
    expect(screen.getByRole("link", { name: /Auditoria/ })).toHaveAttribute(
      "href",
      "/auditoria"
    );
  });

  it("marca o item ativo, inclusive em rota filha", () => {
    vi.mocked(usePathname).mockReturnValue("/tenants");
    const { rerender } = render(<Sidebar />);
    expect(
      screen.getByRole("link", { name: /Tenants/ }).className
    ).toContain("text-navy");

    vi.mocked(usePathname).mockReturnValue("/tenants/abc");
    rerender(<Sidebar />);
    expect(
      screen.getByRole("link", { name: /Tenants/ }).className
    ).toContain("text-navy");

    // O irmão continua inativo.
    expect(
      screen.getByRole("link", { name: /Waitlist/ }).className
    ).toContain("text-stone");
  });

  it("rota fora da lista não acende nenhum item", () => {
    vi.mocked(usePathname).mockReturnValue("/outra-coisa");
    render(<Sidebar />);

    for (const { label } of navItems) {
      expect(
        screen.getByRole("link", { name: new RegExp(label) }).className
      ).toContain("text-stone");
    }
  });
});

describe("Header", () => {
  it("mostra o rótulo da rota atual e o e-mail de quem está logado", () => {
    render(<Header />);

    expect(screen.getByText("Tenants")).toBeInTheDocument();
    expect(screen.getByText("suporte@orbien.app")).toBeInTheDocument();
  });

  it("rota filha mantém o rótulo do item pai", () => {
    vi.mocked(usePathname).mockReturnValue("/waitlist/123");
    render(<Header />);

    expect(screen.getByText("Waitlist")).toBeInTheDocument();
  });

  it("rota desconhecida cai no rótulo genérico", () => {
    vi.mocked(usePathname).mockReturnValue("/nao-existe");
    render(<Header />);

    expect(screen.getByText("Plataforma")).toBeInTheDocument();
  });

  it("sem sessão não mostra e-mail nenhum", () => {
    comSessao(null);
    render(<Header />);

    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });

  it("alterna o tema nos dois sentidos", async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole("button", { name: "Alternar tema" }));
    expect(setTheme).toHaveBeenCalledWith("dark");

    vi.mocked(useTheme).mockReturnValue({
      theme: "dark",
      setTheme,
    } as unknown as ReturnType<typeof useTheme>);
    render(<Header />);
    await user.click(
      screen.getAllByRole("button", { name: "Alternar tema" })[1]
    );
    expect(setTheme).toHaveBeenLastCalledWith("light");
  });

  it("o botão de sair chama o logout do contexto", async () => {
    const user = userEvent.setup();
    render(<Header />);

    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(logout).toHaveBeenCalled();
  });
});

describe("ThemeProvider", () => {
  it("renderiza os filhos e repassa as props ao provider do next-themes", () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light">
        <span>conteúdo</span>
      </ThemeProvider>
    );

    expect(screen.getByText("conteúdo")).toBeInTheDocument();
  });
});
