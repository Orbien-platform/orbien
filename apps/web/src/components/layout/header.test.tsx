import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import type { Dispatch, SetStateAction } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import axios from "axios";
import { Header } from "./header";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: () => ({ push }),
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
    support_session: false,
    support_tenant_name: null,
    areas: null,
    expires_at: Math.floor(Date.now() / 1000) + 300,
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
  it("mostra a seção e a tela da rota atual", () => {
    setup({ pathname: "/financeiro" });
    render(<Header />);
    expect(screen.getByText("Financeiro")).toBeInTheDocument();
    expect(screen.getByText("Visão geral")).toHaveAttribute("aria-current", "page");
  });

  it("mostra a tela mesmo em sub-rota, sem repetir a seção de mesmo nome", () => {
    setup({ pathname: "/pessoas/123/editar" });
    render(<Header />);
    expect(screen.getAllByText("Pessoas")).toHaveLength(1);
  });

  it("mostra o perfil, que fica fora do menu lateral", () => {
    setup({ pathname: "/perfil" });
    render(<Header />);
    expect(screen.getByText("Perfil")).toBeInTheDocument();
  });

  it("cai para Início quando a rota não é mapeada", () => {
    setup({ pathname: "/rota-desconhecida" });
    render(<Header />);
    expect(screen.getByText("Início")).toBeInTheDocument();
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
    expect(screen.getByText("Admin do tenant")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Sair"));
    expect(logout).toHaveBeenCalled();
  });

  it("não mostra papel no menu quando a sessão não tem nenhum", async () => {
    setup({
      user: {
        id: "1",
        name: "Ana Beatriz",
        email: "ana@example.com",
        roles: [],
        tenant_id: "t1",
        congregation_id: "c1",
        support_session: false,
        support_tenant_name: null,
        areas: null,
        expires_at: Math.floor(Date.now() / 1000) + 300,
      },
    });
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    expect(await screen.findByText("Ana Beatriz")).toBeInTheDocument();
    expect(screen.queryByText("Admin do tenant")).not.toBeInTheDocument();
  });

  it.each([
    ["Perfil", "/perfil"],
    ["Configurações", "/configuracoes"],
  ])("o item %s do menu do usuário leva a %s", async (label, href) => {
    push.mockClear();
    setup();
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: label }));
    expect(push).toHaveBeenCalledWith(href);
  });

  it("abre a gaveta lateral pelo botão de menu mobile", async () => {
    setup();
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(await screen.findByText("orbien")).toBeInTheDocument();
  });

  it("não desenha o sino de notificações, que ainda não tem de onde ler", () => {
    setup();
    render(<Header />);
    expect(screen.queryByRole("button", { name: "Notificações" })).not.toBeInTheDocument();
  });

  it("tem a busca de telas no topo", () => {
    setup();
    render(<Header />);
    expect(screen.getByRole("button", { name: "Buscar tela" })).toBeInTheDocument();
  });

  it("mostra o e-mail e a frase sobre escalas e perfil no menu da conta", async () => {
    setup();
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("Escalas e perfil pessoal ficam no app.")).toBeInTheDocument();
  });

  it("Trocar senha pede o e-mail de redefinição e mantém o menu aberto", async () => {
    setup();
    vi.spyOn(axios, "post").mockResolvedValue({});
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Trocar senha" }));
    expect(axios.post).toHaveBeenCalledWith("/api-proxy/auth/forgot-password", {
      email: "ana@example.com",
    });
    expect(await screen.findByText("Enviamos o link para ana@example.com.")).toBeInTheDocument();
  });

  it("Trocar senha avisa quando o envio falha", async () => {
    setup();
    vi.spyOn(axios, "post").mockRejectedValue(new Error("rede"));
    render(<Header />);
    await userEvent.click(screen.getByRole("button", { name: "Menu do usuário" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Trocar senha" }));
    expect(await screen.findByText(/Não foi possível enviar o link/)).toBeInTheDocument();
  });
});
