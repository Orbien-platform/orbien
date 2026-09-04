import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "./header";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedUsePathname = vi.mocked(usePathname);
const mockedUseTheme = vi.mocked(useTheme);
const mockedUseAuth = vi.mocked(useAuth);

function setup({
  pathname = "/dashboard",
  theme = "light",
  user = {
    id: "1",
    name: "Ana Beatriz",
    email: "ana@example.com",
    roles: ["tenant_admin"],
    tenant_id: "t1",
    congregation_id: "c1",
  },
  setTheme = vi.fn(),
  logout = vi.fn(async () => {}),
}: {
  pathname?: string;
  theme?: string;
  user?: ReturnType<typeof useAuth>["user"];
  setTheme?: Dispatch<SetStateAction<string>>;
  logout?: () => Promise<void>;
} = {}) {
  mockedUsePathname.mockReturnValue(pathname);
  mockedUseTheme.mockReturnValue({
    theme,
    setTheme,
    themes: ["light", "dark"],
    resolvedTheme: theme,
    systemTheme: "light",
  });
  mockedUseAuth.mockReturnValue({
    user,
    isLoading: false,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout,
  });
  return { setTheme, logout };
}

describe("Header", () => {
  it("mostra o rótulo da rota atual", () => {
    setup({ pathname: "/financeiro" });
    render(<Header />);
    expect(screen.getByText("Financeiro")).toBeInTheDocument();
  });

  it("mostra o rótulo da rota mesmo em sub-rota", () => {
    setup({ pathname: "/pessoas/123/editar" });
    render(<Header />);
    expect(screen.getByText("Pessoas")).toBeInTheDocument();
  });

  it("cai para Dashboard quando a rota não é mapeada", () => {
    setup({ pathname: "/rota-desconhecida" });
    render(<Header />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("mostra as iniciais do usuário logado", () => {
    setup();
    render(<Header />);
    expect(screen.getByText("AB")).toBeInTheDocument();
  });

  it("mostra '??' quando não há usuário", () => {
    setup({ user: null });
    render(<Header />);
    expect(screen.getByText("??")).toBeInTheDocument();
  });

  it("alterna o tema ao clicar no botão de tema", async () => {
    const { setTheme } = setup({ theme: "light" });
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Alternar tema" }));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("alterna de volta para light quando o tema atual é dark", async () => {
    const { setTheme } = setup({ theme: "dark" });
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Alternar tema" }));
    expect(setTheme).toHaveBeenCalledWith("light");
  });

  it("abre o menu do usuário e mostra nome, papel e ação de sair", async () => {
    const { logout } = setup();
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    expect(await screen.findByText("Ana Beatriz")).toBeInTheDocument();
    expect(screen.getByText("tenant_admin")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Sair"));
    expect(logout).toHaveBeenCalled();
  });

  it("abre a gaveta lateral pelo botão de menu mobile", async () => {
    setup();
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(await screen.findByText("orbien")).toBeInTheDocument();
  });
});
