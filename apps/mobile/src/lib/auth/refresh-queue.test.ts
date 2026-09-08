// Testes derivados do Done-when de T11 (tasks.md) e do Edge Case da spec
// ("duas abas/telas disparam refresh de token ao mesmo tempo"):
// - duas chamadas concorrentes a getValidAccessToken() com token expirado
//   resultam em UMA única chamada a POST /auth/refresh
// - refresh falha -> SecureStore limpo, ambas as chamadas da fila rejeitam
//   com SessionExpiredError

const mockSetItemAsync = jest.fn();
const mockGetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock("expo-secure-store", () => ({
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

const mockPost = jest.fn();
jest.mock("../api/client", () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

import { HttpError } from "../api/errors";
import { getValidAccessToken } from "./auth-client";
import { SessionExpiredError } from "./session-expired-error";

const EXPIRED_SESSION = {
  accessToken: "old-token",
  refreshToken: "refresh-1",
  accessTokenExpiresAt: Date.now() - 1000,
};

describe("fila de refresh serializada (getValidAccessToken)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(JSON.stringify(EXPIRED_SESSION));
  });

  it("retorna o access token direto quando ainda não expirou, sem chamar refresh", async () => {
    mockGetItemAsync.mockResolvedValue(
      JSON.stringify({ ...EXPIRED_SESSION, accessTokenExpiresAt: Date.now() + 60_000 }),
    );

    const token = await getValidAccessToken();

    expect(token).toBe("old-token");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("duas chamadas concorrentes com token expirado resultam em uma única chamada a POST /auth/refresh", async () => {
    mockPost.mockResolvedValue({
      access_token: "novo-token",
      refresh_token: "novo-refresh",
      expires_in: 900,
    });

    const [token1, token2] = await Promise.all([getValidAccessToken(), getValidAccessToken()]);

    expect(token1).toBe("novo-token");
    expect(token2).toBe("novo-token");
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/auth/refresh", {
      body: { refresh_token: "refresh-1" },
    });
  });

  it("refresh falha: limpa o SecureStore e rejeita toda a fila com SessionExpiredError", async () => {
    mockPost.mockRejectedValue(new HttpError(401, { message: "refresh token revogado" }));

    const call1 = getValidAccessToken();
    const call2 = getValidAccessToken();

    await expect(call1).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(call2).rejects.toBeInstanceOf(SessionExpiredError);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockDeleteItemAsync).toHaveBeenCalledWith("orbien.session");
  });
});
