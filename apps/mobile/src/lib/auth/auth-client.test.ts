// Testes derivados do Done-when de T10 (tasks.md) e dos ACs de MOB-01
// (spec.md):
// - AC 1: login grava sessão no SecureStore
// - AC 2: erro genérico — AuthClient não distingue tipos de erro, só repassa
//   a mensagem que a API já devolve
// - AC 5: logout limpa o SecureStore mesmo com a chamada de rede falhando

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
import { login, logout, getSession } from "./auth-client";

describe("AuthClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("login", () => {
    it("AC 1: autentica e grava a sessão (tokens + expiração calculada) no SecureStore", async () => {
      const nowSpy = jest.spyOn(Date, "now").mockReturnValue(1_000_000);
      mockPost.mockResolvedValue({
        access_token: "access-abc",
        refresh_token: "refresh-xyz",
        expires_in: 900,
      });

      const session = await login("igreja-teste", "a@b.com", "senha123");

      expect(mockPost).toHaveBeenCalledWith("/auth/login", {
        body: { tenant_slug: "igreja-teste", email: "a@b.com", password: "senha123" },
      });
      expect(session).toEqual({
        accessToken: "access-abc",
        refreshToken: "refresh-xyz",
        accessTokenExpiresAt: 1_000_000 + 900 * 1000,
      });
      expect(mockSetItemAsync).toHaveBeenCalledWith(
        "orbien.session",
        JSON.stringify(session),
      );

      nowSpy.mockRestore();
    });

    it("AC 2: credenciais erradas — repassa a mesma mensagem genérica que a API devolve, sem reescrever por tipo de erro", async () => {
      const genericError = new HttpError(401, { message: "Credenciais inválidas" });
      mockPost.mockRejectedValue(genericError);

      await expect(login("igreja-teste", "a@b.com", "errada")).rejects.toBe(genericError);
      // AuthClient não deve gravar sessão nenhuma quando o login falha.
      expect(mockSetItemAsync).not.toHaveBeenCalled();
    });
  });

  describe("getSession", () => {
    it("retorna null quando não há sessão salva", async () => {
      mockGetItemAsync.mockResolvedValue(null);

      await expect(getSession()).resolves.toBeNull();
    });

    it("retorna a sessão desserializada quando há uma salva", async () => {
      const stored = { accessToken: "a", refreshToken: "r", accessTokenExpiresAt: 123 };
      mockGetItemAsync.mockResolvedValue(JSON.stringify(stored));

      await expect(getSession()).resolves.toEqual(stored);
    });

    it("valor salvo corrompido (JSON inválido): trata como sem sessão e limpa a chave, em vez de rejeitar", async () => {
      mockGetItemAsync.mockResolvedValue("{isso não é JSON");

      await expect(getSession()).resolves.toBeNull();
      expect(mockDeleteItemAsync).toHaveBeenCalledWith("orbien.session");
    });
  });

  describe("logout", () => {
    it("AC 5: chama o endpoint de logout e limpa o SecureStore", async () => {
      mockGetItemAsync.mockResolvedValue(
        JSON.stringify({ accessToken: "a", refreshToken: "r", accessTokenExpiresAt: 123 }),
      );
      mockPost.mockResolvedValue(undefined);

      await logout();

      expect(mockPost).toHaveBeenCalledWith("/auth/logout", {
        token: "a",
        body: { refresh_token: "r" },
      });
      expect(mockDeleteItemAsync).toHaveBeenCalledWith("orbien.session");
    });

    it("AC 5: limpa o SecureStore mesmo quando a chamada de rede de logout falha", async () => {
      mockGetItemAsync.mockResolvedValue(
        JSON.stringify({ accessToken: "a", refreshToken: "r", accessTokenExpiresAt: 123 }),
      );
      mockPost.mockRejectedValue(new Error("Erro de rede"));

      await expect(logout()).resolves.toBeUndefined();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith("orbien.session");
    });
  });
});
