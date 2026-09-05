import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import type { SessionUser } from "@/lib/session";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

const mockedUsePathname = vi.mocked(usePathname);
const mockedUseAuth = vi.mocked(useAuth);

const BASE_USER: SessionUser = {
  id: "u1",
  name: "ana",
  email: "ana@example.com",
  roles: ["tenant_admin"],
  tenant_id: "t1",
  congregation_id: "c1",
  support_session: false,
  support_tenant_name: null,
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
  });
  it("mostra o nome padrão da congregação e todos os itens de navegação", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    expect(screen.getByText("orbien")).toBeInTheDocument();
    expect(screen.getByText("Doca Church")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Pessoas")).toBeInTheDocument();
    expect(screen.getByText("Grupos")).toBeInTheDocument();
    expect(screen.getByText("Financeiro")).toBeInTheDocument();
    expect(screen.getByText("Conteúdo")).toBeInTheDocument();
    expect(screen.getByText("Voluntários")).toBeInTheDocument();
    expect(screen.getByText("Celebrações")).toBeInTheDocument();
    expect(screen.getByText("Configurações")).toBeInTheDocument();
  });

  it("usa o nome de congregação customizado", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar congregationName="Igreja Central" />);
    expect(screen.getByText("Igreja Central")).toBeInTheDocument();
  });

  it("marca o item ativo quando o pathname é exatamente a rota", () => {
    mockedUsePathname.mockReturnValue("/pessoas");
    render(<Sidebar />);
    const link = screen.getByText("Pessoas").closest("a");
    expect(link?.className).toContain("text-navy");
  });

  it("marca o item ativo quando o pathname é uma sub-rota", () => {
    mockedUsePathname.mockReturnValue("/pessoas/123");
    render(<Sidebar />);
    const link = screen.getByText("Pessoas").closest("a");
    expect(link?.className).toContain("text-navy");
  });

  it("não marca como ativo um item cujo pathname só compartilha o prefixo", () => {
    mockedUsePathname.mockReturnValue("/pessoas-extra");
    render(<Sidebar />);
    const link = screen.getByText("Pessoas").closest("a");
    expect(link?.className).not.toContain("text-navy");
    expect(link?.className).toContain("text-stone");
  });

  it("aponta cada link para o href correto", () => {
    mockedUsePathname.mockReturnValue("/dashboard");
    render(<Sidebar />);
    expect(screen.getByText("Financeiro").closest("a")).toHaveAttribute(
      "href",
      "/financeiro"
    );
  });

  // O link só desenha o que o papel alcança. Não é controle de acesso — quem
  // digitar a URL chega à tela e recebe de lá o "sem acesso" —, é não oferecer
  // um caminho que termina em 403.
  describe("filtro por papel", () => {
    it("esconde de um voluntário tudo que ele não lê", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      signedInAs({ roles: ["volunteer"] });
      render(<Sidebar />);

      expect(screen.queryByText("Pessoas")).not.toBeInTheDocument();
      expect(screen.queryByText("Financeiro")).not.toBeInTheDocument();
      expect(screen.queryByText("Celebrações")).not.toBeInTheDocument();
      // Sem `@Roles` na API: seguem visíveis para qualquer sessão.
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      expect(screen.getByText("Configurações")).toBeInTheDocument();
    });

    it("mostra ao tesoureiro o financeiro, e não o que é de outra área", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      signedInAs({ roles: ["treasurer"] });
      render(<Sidebar />);

      expect(screen.getByText("Financeiro")).toBeInTheDocument();
      expect(screen.getByText("Pessoas")).toBeInTheDocument();
      expect(screen.queryByText("Celebrações")).not.toBeInTheDocument();
      expect(screen.queryByText("Conteúdo")).not.toBeInTheDocument();
    });

    it("mostra ao líder de ministério celebrações e voluntários, não o financeiro", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      signedInAs({ roles: ["ministry_leader"] });
      render(<Sidebar />);

      expect(screen.getByText("Celebrações")).toBeInTheDocument();
      expect(screen.getByText("Voluntários")).toBeInTheDocument();
      expect(screen.queryByText("Financeiro")).not.toBeInTheDocument();
    });

    it("a sessão de suporte vê tudo, como o RolesGuard já a deixa ler", () => {
      mockedUsePathname.mockReturnValue("/dashboard");
      signedInAs({ roles: [], support_session: true });
      render(<Sidebar />);

      expect(screen.getByText("Pessoas")).toBeInTheDocument();
      expect(screen.getByText("Financeiro")).toBeInTheDocument();
      expect(screen.getByText("Celebrações")).toBeInTheDocument();
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

      expect(screen.queryByText("Pessoas")).not.toBeInTheDocument();
      expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    });
  });
});
