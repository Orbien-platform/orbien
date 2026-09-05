import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/hooks/useAuth";
import type { SessionUser } from "@/lib/session";
import { SupportSessionBanner, formatRemaining } from "./SupportSessionBanner";

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
  support_expires_at: null,
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

  it("não mostra relógio quando a sessão não tem prazo conhecido", () => {
    setup({ ...BASE_USER, support_session: true, support_expires_at: null });
    render(<SupportSessionBanner />);
    expect(screen.getByRole("status")).not.toHaveTextContent("Expira em");
  });

  describe("contagem regressiva", () => {
    // A sessão de suporte não se renova: sem aviso, o fim chega como um 401 no
    // meio de uma ação. Estes três casos travam o que a faixa diz em cada
    // momento — sobrando tempo, no último minuto, e depois do fim.
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date("2026-09-05T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /** Render + o primeiro tique do relógio, que sai por timer. */
    function renderTicking() {
      render(<SupportSessionBanner />);
      act(() => {
        vi.advanceTimersByTime(1);
      });
    }

    function supportUserExpiringIn(ms: number): SessionUser {
      return {
        ...BASE_USER,
        support_session: true,
        support_tenant_name: "Igreja Vida Nova",
        support_expires_at: Date.now() + ms,
      };
    }

    it("mostra o tempo restante e não alarma enquanto sobra tempo", () => {
      setup(supportUserExpiringIn(5 * 60_000));
      renderTicking();

      const banner = screen.getByRole("status");
      expect(banner).toHaveTextContent("Expira em 5:00");
      expect(banner).toHaveAttribute("aria-live", "off");
      expect(banner).not.toHaveTextContent("conclua o que estiver fazendo");
    });

    it("no último minuto muda de tom e passa a se anunciar", () => {
      setup(supportUserExpiringIn(45_000));
      renderTicking();

      const banner = screen.getByRole("status");
      expect(banner).toHaveTextContent("Expira em 0:45 — conclua o que estiver fazendo.");
      expect(banner).toHaveAttribute("aria-live", "assertive");
    });

    it("conta o tempo passando, sem depender do valor inicial", () => {
      setup(supportUserExpiringIn(90_000));
      renderTicking();
      expect(screen.getByRole("status")).toHaveTextContent("Expira em 1:30");

      act(() => {
        vi.advanceTimersByTime(31_000);
      });

      expect(screen.getByRole("status")).toHaveTextContent("Expira em 0:59");
    });

    it("depois do fim diz que expirou, em vez de contar negativo", () => {
      setup(supportUserExpiringIn(-5_000));
      renderTicking();

      const banner = screen.getByRole("status");
      expect(banner).toHaveTextContent("Sessão expirada — faça login novamente.");
      expect(banner).not.toHaveTextContent("Expira em");
    });
  });

  describe("formatRemaining", () => {
    it("formata como m:ss e trata o passado como zero", () => {
      expect(formatRemaining(300_000)).toBe("5:00");
      expect(formatRemaining(65_000)).toBe("1:05");
      expect(formatRemaining(1_000)).toBe("0:01");
      expect(formatRemaining(-9_000)).toBe("0:00");
    });
  });

  it("chama logout ao clicar em Encerrar sessão", async () => {
    const { logout } = setup({ ...BASE_USER, support_session: true, support_tenant_name: "Igreja Vida Nova" });
    render(<SupportSessionBanner />);

    await userEvent.click(screen.getByRole("button", { name: "Encerrar sessão" }));

    expect(logout).toHaveBeenCalled();
  });
});
