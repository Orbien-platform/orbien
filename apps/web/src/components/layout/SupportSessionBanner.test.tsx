import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import type { SessionUser } from "@/lib/session";
import { SupportSessionBanner } from "./SupportSessionBanner";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

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
};

function setup(user: SessionUser | null) {
  const logout = vi.fn(async () => {});
  mockedUseAuth.mockReturnValue({
    user,
    isLoading: false,
    isAuthenticated: !!user,
    login: vi.fn(),
    logout,
  });
  return { logout };
}

describe("SupportSessionBanner", () => {
  it("não renderiza nada quando não há usuário", () => {
    setup(null);
    render(<SupportSessionBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("não renderiza quando a sessão não é de suporte", () => {
    setup(BASE_USER);
    render(<SupportSessionBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renderiza a faixa quando a sessão é de suporte, com o nome do tenant", () => {
    setup({ ...BASE_USER, support_session: true, support_tenant_name: "Igreja Vida Nova" });
    render(<SupportSessionBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Sessão de suporte da plataforma");
    expect(banner).toHaveTextContent("Igreja Vida Nova");
    expect(banner).toHaveTextContent("Toda ação fica");
  });

  it("renderiza a faixa sem nome de tenant quando ele não está salvo", () => {
    setup({ ...BASE_USER, support_session: true, support_tenant_name: null });
    render(<SupportSessionBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Sessão de suporte da plataforma.");
  });

  it("chama logout ao clicar em Encerrar sessão", async () => {
    const { logout } = setup({ ...BASE_USER, support_session: true, support_tenant_name: "Igreja Vida Nova" });
    render(<SupportSessionBanner />);

    await userEvent.click(screen.getByRole("button", { name: "Encerrar sessão" }));

    expect(logout).toHaveBeenCalled();
  });
});
