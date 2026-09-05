import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("axios", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

import axios from "axios";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "@/hooks/useAuth";
import type { SessionUser } from "@/lib/session";

const USER: SessionUser = {
  id: "user-1",
  name: "joao silva",
  email: "joao.silva@example.com",
  roles: ["tenant_admin"],
  tenant_id: "tenant-1",
  congregation_id: "cong-1",
  support_session: false,
  support_tenant_name: null,
    support_expires_at: null,
};

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe("AuthProvider", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(axios.get).mockReset();
    vi.mocked(axios.post).mockReset();
    vi.mocked(axios.delete).mockReset();
  });

  it("com sessão válida: monta o usuário a partir de GET /api/session", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { user: USER } });

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(axios.get).toHaveBeenCalledWith("/api/session");
    expect(result.current.user).toEqual(USER);
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("sem sessão (401 ou erro): termina o loading sem usuário", async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error("401"));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("login: chama POST /api/session, monta usuário e navega para o dashboard", async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error("401"));
    vi.mocked(axios.post).mockResolvedValue({ data: { user: USER } });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("joao@example.com", "senha", "igreja-x");
    });

    expect(axios.post).toHaveBeenCalledWith("/api/session", {
      email: "joao@example.com",
      password: "senha",
      tenant_slug: "igreja-x",
    });
    expect(result.current.user).toEqual(USER);
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("logout: chama DELETE /api/session, limpa o usuário e navega para o login mesmo se a chamada falhar", async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { user: USER } });
    vi.mocked(axios.delete).mockRejectedValue(new Error("network"));
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, replace: vi.fn() },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(axios.delete).toHaveBeenCalledWith("/api/session");
    expect(result.current.user).toBeNull();
    expect(window.location.replace).toHaveBeenCalledWith("/login");

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("desmontado antes do GET /api/session responder: não tenta atualizar estado", async () => {
    let resolveGet: (value: { data: { user: SessionUser | null } }) => void = () => {};
    vi.mocked(axios.get).mockReturnValue(
      new Promise((resolve) => {
        resolveGet = resolve;
      })
    );

    const { unmount } = renderAuth();
    unmount();

    // Resolve depois do unmount: sem `ativo`, o React acusaria "state update
    // on an unmounted component" — o teste falha se isso disparar.
    resolveGet({ data: { user: USER } });
    await Promise.resolve();
  });
});
