// Testes de fix da lacuna apontada pelo Verifier (validation.md): o
// ApiClient precisa de fato interceptar 401 e delegar ao AuthClient (AC 3 e
// AC 4 de MOB-01, design.md — "ApiClient intercepta 401 e delega ao
// AuthClient"). Cobrem o caminho reativo de `authenticatedRequest`:
// - AC 3: 401 na chamada original dispara UMA renovação e reenvia a
//   chamada original com o token novo, com sucesso na segunda tentativa
// - AC 4: renovação falha -> SessionExpiredError propaga e quem assinou
//   onSessionExpired é notificado (AuthProvider reage a isso)
// - erro que não é 401 nunca aciona renovação, só propaga

const mockSetItemAsync = jest.fn();
const mockGetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock("expo-secure-store", () => ({
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
jest.mock("../api/client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}));

import { HttpError } from "../api/errors";
import { authenticatedRequest, onSessionExpired } from "./auth-client";
import { SessionExpiredError } from "./session-expired-error";

const VALID_SESSION = {
  accessToken: "token-valido",
  refreshToken: "refresh-1",
  accessTokenExpiresAt: Date.now() + 60_000,
};

describe("authenticatedRequest — interceptação reativa de 401", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetItemAsync.mockResolvedValue(JSON.stringify(VALID_SESSION));
  });

  it("AC 3: 401 na chamada original dispara uma renovação e reenvia a chamada original com o token novo", async () => {
    mockApiGet
      .mockRejectedValueOnce(new HttpError(401, { message: "token revogado" }))
      .mockResolvedValueOnce({ ok: true });
    mockApiPost.mockResolvedValue({
      access_token: "token-novo",
      refresh_token: "refresh-2",
      expires_in: 900,
    });

    const result = await authenticatedRequest<{ ok: boolean }>("get", "/settings");

    expect(result).toEqual({ ok: true });
    // primeira tentativa com o token da sessão vigente, segunda com o novo.
    expect(mockApiGet).toHaveBeenNthCalledWith(1, "/settings", {
      token: "token-valido",
      body: undefined,
    });
    expect(mockApiGet).toHaveBeenNthCalledWith(2, "/settings", {
      token: "token-novo",
      body: undefined,
    });
    // exatamente uma renovação, não uma por tentativa.
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith("/auth/refresh", {
      body: { refresh_token: "refresh-1" },
    });
  });

  it("AC 4: renovação falha após 401 -> propaga SessionExpiredError e notifica onSessionExpired", async () => {
    mockApiGet.mockRejectedValue(new HttpError(401, { message: "token revogado" }));
    mockApiPost.mockRejectedValue(new HttpError(401, { message: "refresh revogado" }));

    const listener = jest.fn();
    const unsubscribe = onSessionExpired(listener);

    await expect(authenticatedRequest("get", "/settings")).rejects.toBeInstanceOf(
      SessionExpiredError,
    );

    expect(listener).toHaveBeenCalledTimes(1);
    expect(mockDeleteItemAsync).toHaveBeenCalledWith("orbien.session");
    // só uma tentativa de renovação, mesmo ela falhando.
    expect(mockApiPost).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("erro que não é 401 (ex.: 500) propaga direto, sem acionar renovação", async () => {
    mockApiGet.mockRejectedValue(new HttpError(500, { message: "erro interno" }));

    await expect(authenticatedRequest("get", "/settings")).rejects.toMatchObject({
      status: 500,
    });

    expect(mockApiPost).not.toHaveBeenCalled();
  });
});
