// Testes derivados do Done-when de T9 (tasks.md) e do Error Handling
// Strategy do design.md:
// - sucesso: retorna o corpo desserializado
// - erro HTTP com body de erro: rejeita com HttpError (status + body)
// - erro de rede (fetch rejeita): rejeita com NetworkError, distinto de HttpError
// - base URL vem de `Constants.expoConfig.extra.apiUrl` (mock de Constants)

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { apiUrl: "https://api.exemplo.test" },
    },
  },
}));

import { HttpError, NetworkError } from "./errors";
import { apiClient } from "./client";

describe("ApiClient", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it("sucesso: retorna o corpo desserializado da resposta", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "abc123" }),
    }) as unknown as typeof fetch;

    const result = await apiClient.get<{ id: string }>("/pessoas/me");

    expect(result).toEqual({ id: "abc123" });
  });

  it("usa a base URL de Constants.expoConfig.extra.apiUrl, nunca hardcoded", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await apiClient.get("/settings");

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.exemplo.test/settings",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("injeta Authorization: Bearer quando um token é passado", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await apiClient.get("/settings", { token: "tok-123" });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.exemplo.test/settings",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok-123" }),
      }),
    );
  });

  it("erro HTTP com body de erro: rejeita com HttpError carregando status e mensagem do body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Credenciais inválidas" }),
    }) as unknown as typeof fetch;

    const error = await apiClient.post("/auth/login", { body: {} }).catch((e) => e);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(401);
    expect((error as HttpError).message).toBe("Credenciais inválidas");
  });

  it("erro de rede (fetch rejeita): rejeita com NetworkError, distinto de HttpError", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed")) as unknown as typeof fetch;

    const error = await apiClient.get("/settings").catch((e) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect(error).not.toBeInstanceOf(HttpError);
  });
});

describe("ApiClient — apiUrl ausente na config", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock("expo-constants", () => ({
      __esModule: true,
      default: { expoConfig: { extra: {} } },
    }));
  });

  afterEach(() => {
    jest.dontMock("expo-constants");
  });

  it("falha alto (não faz fetch com URL relativa vazia) quando extra.apiUrl não está configurada", async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    // require() de propósito (não import dinâmico): precisa recarregar o
    // módulo reagindo ao mock de expo-constants sem cache do registry —
    // mesma técnica já usada em app.config.test.js.
    const { apiClient: apiClientSemConfig } = require("./client") as typeof import("./client");
    const { NetworkError: NetworkErrorReloaded } = require("./errors") as typeof import("./errors");

    const error = await apiClientSemConfig.get("/settings").catch((e: unknown) => e);

    expect((error as Error).message).toMatch(/apiUrl/);
    // erro de config não pode se disfarçar de erro de rede — senão o app
    // trataria "apiUrl não configurada" como "sem internet".
    expect(error).not.toBeInstanceOf(NetworkErrorReloaded);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
