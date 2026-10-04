import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { SessionUser } from "@/lib/session";
import { useChurchIdentity } from "@/contexts/ChurchIdentityContext";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/contexts/ChurchIdentityContext", () => ({ useChurchIdentity: vi.fn() }));

const mockedUsePathname = vi.mocked(usePathname);
const mockedUseAuth = vi.mocked(useAuth);
const mockedUseChurchIdentity = vi.mocked(useChurchIdentity);

const BASE_USER: SessionUser = {
  id: "u1",
  name: "ana",
  email: "ana@example.com",
  roles: ["tenant_admin"],
  tenant_id: "t1",
  congregation_id: "c1",
  support_session: false,
  support_tenant_name: null,
  areas: null,
  expires_at: Math.floor(Date.now() / 1000) + 300,
};

function signedInAs(overrides: Partial<SessionUser> = {}) {
  mockedUseAuth.mockReturnValue({
    user: { ...BASE_USER, ...overrides },
    isLoading: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe("Sidebar", () => {
  beforeEach(() => {
    // `tenant_admin` enxerga todas as áreas — é o estado em que os casos de
    // navegação abaixo foram escritos.
    signedInAs();
    mockedUseChurchIdentity.mockReturnValue({
      churchName: "Igreja Teste Um",
      congregationName: "Sede",
    });
  });

  it("agrupa os itens nas seções da direção Órbita", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    for (const section of [
      "Pessoas",
      "Comunidade",
      "Cultos e serviço",
      "Comunicação",
      "Financeiro",
      "Administração",
    ]) {
      expect(screen.getByText(section, { selector: "p" })).toBeInTheDocument();
    }
    for (const item of [
      "Início",
      "Grupos",
      "Redes",
      "Celebrações",
      "Ministérios",
      "Repertório",
      "Publicações",
      "Visão geral",
      "Configurações",
      "Auditoria",
    ]) {
      expect(screen.getByRole("link", { name: item })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Pessoas" })).toBeInTheDocument();
  });

  it("mostra o nome da igreja e a congregação vindos da identidade", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    expect(screen.getByText("Igreja Teste Um")).toBeInTheDocument();
    expect(screen.getByText("Sede")).toBeInTheDocument();
    expect(screen.getByText("IT")).toBeInTheDocument();
  });

  it("não repete a congregação quando ela tem o nome da igreja", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    mockedUseChurchIdentity.mockReturnValue({
      churchName: "Igreja Teste Um",
      congregationName: "Igreja Teste Um",
    });
    render(<Sidebar />);
    expect(screen.getAllByText("Igreja Teste Um")).toHaveLength(1);
  });

  it("cai num nome genérico enquanto a identidade não carrega", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    mockedUseChurchIdentity.mockReturnValue({ churchName: null, congregationName: null });
    render(<Sidebar />);
    expect(screen.getByText("Sua igreja")).toBeInTheDocument();
  });

  it("marca o item ativo quando o pathname é exatamente a rota", () => {
    mockedUsePathname.mockReturnValue("/pessoas");
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: "Pessoas" });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link.className).toContain("text-brand-ink");
  });

  it("marca o item ativo quando o pathname é uma sub-rota", () => {
    mockedUsePathname.mockReturnValue("/pessoas/123");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Pessoas" })).toHaveAttribute("aria-current", "page");
  });

  it("não marca como ativo um item cujo pathname só compartilha o prefixo", () => {
    mockedUsePathname.mockReturnValue("/pessoas-extra");
    render(<Sidebar />);
    const link = screen.getByRole("link", { name: "Pessoas" });
    expect(link).not.toHaveAttribute("aria-current");
    expect(link.className).toContain("text-stone");
  });

  it("aponta cada link para o href correto", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Visão geral" })).toHaveAttribute("href", "/financeiro");
    expect(screen.getByRole("link", { name: "Ministérios" })).toHaveAttribute("href", "/voluntarios");
    expect(screen.getByRole("link", { name: "Publicações" })).toHaveAttribute("href", "/conteudo");
    expect(screen.getByRole("link", { name: "Redes" })).toHaveAttribute("href", "/redes");
  });

  // O link só desenha o que a sessão alcança, e quem diz o que ela alcança é a
  // API, em `GET /me/permissions` — o front não repete mais as listas de
  // `@Roles`. Não é controle de acesso: quem digitar a URL chega à tela e
  // recebe de lá o "sem acesso". É não oferecer um caminho que termina em 403.
  describe("filtro por área", () => {
    it("esconde de um voluntário tudo que ele não lê", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      signedInAs({ roles: ["volunteer"], areas: [] });
      render(<Sidebar />);

      expect(screen.queryByRole("link", { name: "Pessoas" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Visão geral" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Celebrações" })).not.toBeInTheDocument();
      // Seção sem item visível não desenha o título.
      expect(screen.queryByText("Financeiro")).not.toBeInTheDocument();
      // Sem `@Roles` na API: seguem visíveis para qualquer sessão.
      expect(screen.getByRole("link", { name: "Início" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Configurações" })).toBeInTheDocument();
    });

    it("mostra ao tesoureiro o financeiro, e não o que é de outra área", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      signedInAs({
        roles: ["treasurer"],
        areas: ["persons", "small_groups", "financial"],
      });
      render(<Sidebar />);

      expect(screen.getByRole("link", { name: "Visão geral" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Pessoas" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Celebrações" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Publicações" })).not.toBeInTheDocument();
    });

    it("mostra ao líder de ministério celebrações e ministérios, não o financeiro", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      signedInAs({ roles: ["ministry_leader"], areas: ["volunteers", "celebrations"] });
      render(<Sidebar />);

      expect(screen.getByRole("link", { name: "Celebrações" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Ministérios" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Visão geral" })).not.toBeInTheDocument();
    });

    it("a sessão de suporte vê tudo — a API responde todas as áreas para ela", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      signedInAs({
        roles: [],
        support_session: true,
        areas: ["persons", "small_groups", "financial", "content", "volunteers", "celebrations"],
      });
      render(<Sidebar />);

      expect(screen.getByRole("link", { name: "Pessoas" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Visão geral" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Celebrações" })).toBeInTheDocument();
    });

    it("sem sessão não desenha link nenhum de área", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      mockedUseAuth.mockReturnValue({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        login: vi.fn(),
        logout: vi.fn(),
      });
      render(<Sidebar />);

      expect(screen.queryByRole("link", { name: "Pessoas" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Início" })).not.toBeInTheDocument();
    });
  });
});
