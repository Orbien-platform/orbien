// Testes de PermissionsClient — wrapper fino sobre authenticatedRequest,
// fail-open (nunca lança, devolve null em qualquer falha).
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import { fetchAreas } from "./permissions-client";

describe("PermissionsClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchAreas", () => {
    it("chama GET /me/permissions e devolve as áreas", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ areas: ["volunteers", "content"] });

      await expect(fetchAreas()).resolves.toEqual(["volunteers", "content"]);
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/me/permissions");
    });

    it("devolve null quando a resposta não tem a forma esperada", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ areas: "tudo" });

      await expect(fetchAreas()).resolves.toBeNull();
    });

    it("devolve null quando a resposta não tem o campo areas", async () => {
      mockAuthenticatedRequest.mockResolvedValue({});

      await expect(fetchAreas()).resolves.toBeNull();
    });

    it("devolve null e não lança quando a chamada falha (rede, token vencido)", async () => {
      mockAuthenticatedRequest.mockRejectedValue(new Error("ECONNREFUSED"));

      await expect(fetchAreas()).resolves.toBeNull();
    });
  });
});
