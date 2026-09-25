import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import PerfilPage from "./page";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

function setup(
  user: ReturnType<typeof useAuth>["user"],
  isLoading = false
) {
  mockedUseAuth.mockReturnValue({
    user,
    isLoading,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

const user = {
  id: "1",
  name: "Ana Beatriz",
  email: "ana@example.com",
  roles: ["tenant_admin", "pastor"],
  tenant_id: "t1",
  congregation_id: "c1",
  support_session: false,
  support_tenant_name: null,
  areas: null,
  expires_at: Math.floor(Date.now() / 1000) + 300,
};

describe("PerfilPage", () => {
  it("mostra nome, e-mail e papéis legíveis da sessão", () => {
    setup(user);
    render(<PerfilPage />);
    expect(screen.getByText("AB")).toBeInTheDocument();
    expect(screen.getAllByText("Ana Beatriz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ana@example.com").length).toBeGreaterThan(0);
    expect(screen.getByText("Papéis")).toBeInTheDocument();
    expect(screen.getByText("Admin do tenant, Pastor")).toBeInTheDocument();
  });

  it("usa o singular com um papel só", () => {
    setup({ ...user, roles: ["pastor"] });
    render(<PerfilPage />);
    expect(screen.getByText("Papel")).toBeInTheDocument();
    expect(screen.getByText("Pastor")).toBeInTheDocument();
  });

  it("mostra um traço quando a sessão não tem papel", () => {
    setup({ ...user, roles: [] });
    render(<PerfilPage />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("avisa quando não há sessão", () => {
    setup(null);
    render(<PerfilPage />);
    expect(screen.getByText(/Não foi possível carregar a sessão/)).toBeInTheDocument();
  });

  it("não mostra dados enquanto carrega", () => {
    setup(null, true);
    render(<PerfilPage />);
    expect(screen.queryByText(/Não foi possível/)).not.toBeInTheDocument();
  });
});
