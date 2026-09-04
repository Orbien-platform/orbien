import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  saveTokens: vi.fn(),
  clearTokens: vi.fn(),
  getAccessToken: vi.fn(),
  getRefreshToken: vi.fn(),
  getUserEmail: vi.fn(),
  decodeJwtPayload: vi.fn(),
  isTokenExpired: vi.fn(),
}));

import api from "@/lib/api";
import {
  clearTokens,
  decodeJwtPayload,
  getAccessToken,
  getRefreshToken,
  getUserEmail,
  isTokenExpired,
  saveTokens,
} from "@/lib/auth";
import { AuthProvider } from "./AuthContext";
import { useAuth } from "@/hooks/useAuth";

const payload = {
  sub: "user-1",
  tenant_id: "tenant-1",
  congregation_id: "cong-1",
  roles: ["tenant_admin"],
  plan: "pro",
  iat: 0,
  exp: 9999999999,
};

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe("AuthProvider", () => {
  beforeEach(() => {
    push.mockClear();
    vi.mocked(getAccessToken).mockReturnValue(null);
    vi.mocked(getUserEmail).mockReturnValue(null);
    vi.mocked(getRefreshToken).mockReturnValue("refresh-token");
    vi.mocked(decodeJwtPayload).mockReturnValue(payload);
    vi.mocked(isTokenExpired).mockReturnValue(false);
    vi.mocked(saveTokens).mockClear();
    vi.mocked(clearTokens).mockClear();
    vi.mocked(api.post).mockReset();
  });

  it("sem token salvo: termina o loading sem usuário", async () => {
    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("com token válido salvo: monta o usuário a partir do payload", async () => {
    vi.mocked(getAccessToken).mockReturnValue("valid-token");
    vi.mocked(getUserEmail).mockReturnValue("joao.silva@example.com");

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toEqual({
      id: "user-1",
      name: "joao silva",
      email: "joao.silva@example.com",
      roles: ["tenant_admin"],
      tenant_id: "tenant-1",
      congregation_id: "cong-1",
    });
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("com token expirado: ainda monta o usuário para renderizar a shell", async () => {
    vi.mocked(getAccessToken).mockReturnValue("expired-token");
    vi.mocked(getUserEmail).mockReturnValue("user@example.com");
    vi.mocked(isTokenExpired).mockReturnValue(true);

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user?.id).toBe("user-1");
  });

  it("quando o payload não decodifica, o usuário fica nulo", async () => {
    vi.mocked(getAccessToken).mockReturnValue("token");
    vi.mocked(getUserEmail).mockReturnValue("user@example.com");
    vi.mocked(decodeJwtPayload).mockReturnValue(null);

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("login: salva tokens, monta usuário e navega para o dashboard", async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: { access_token: "new-token", refresh_token: "new-refresh", expires_in: 900 },
    });

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login("joao@example.com", "senha", "igreja-x");
    });

    expect(api.post).toHaveBeenCalledWith("/auth/login", {
      email: "joao@example.com",
      password: "senha",
      tenant_slug: "igreja-x",
    });
    expect(saveTokens).toHaveBeenCalledWith("new-token", "new-refresh", "joao@example.com");
    expect(result.current.user?.email).toBe("joao@example.com");
    expect(push).toHaveBeenCalledWith("/dashboard");
  });

  it("logout: limpa tokens e navega para o login mesmo se a chamada à API falhar", async () => {
    vi.mocked(api.post).mockRejectedValue(new Error("network"));

    const { result } = renderAuth();
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.logout();
    });

    expect(clearTokens).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
    expect(push).toHaveBeenCalledWith("/login");
  });
});
