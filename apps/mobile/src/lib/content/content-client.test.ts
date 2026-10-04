// Testes de ContentClient — wrapper fino sobre authenticatedRequest.
// Cada teste confirma o path/query que a task R3-T3 (tasks.md) exige
// (MOB-06, AC2).
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import {
  cancelMyEventRegistration,
  getEventRegistrationSummary,
  getMyEventRegistration,
  getHighlights,
  getPost,
  getPosts,
  isPaidRegistration,
  registerSelfForEvent,
} from "./content-client";

describe("ContentClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getPosts", () => {
    it("pede só publicados mesmo sem argumento — rascunho não vai para o app", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ data: [], total: 0 });

      await getPosts();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/content/posts?published=true");
    });

    it("monta a query ?page=2&limit=10 quando page e limit são informados", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ data: [], total: 0 });

      await getPosts(2, 10);

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/content/posts?published=true&page=2&limit=10");
    });

    it("retorna o PostsPage resolvido pelo authenticatedRequest", async () => {
      const page = { data: [{ id: "p1" }], total: 1 };
      mockAuthenticatedRequest.mockResolvedValue(page);

      const result = await getPosts(1, 20);

      expect(result).toEqual(page);
    });
  });

  describe("getHighlights", () => {
    it("chama GET /content/posts/highlights", async () => {
      mockAuthenticatedRequest.mockResolvedValue([{ id: "p1" }]);

      const result = await getHighlights();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/content/posts/highlights");
      expect(result).toEqual([{ id: "p1" }]);
    });
  });

  describe("getPost", () => {
    it("chama GET /content/posts/:id com o id informado", async () => {
      const post = { id: "abc", title: "Título" };
      mockAuthenticatedRequest.mockResolvedValue(post);

      const result = await getPost("abc");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/content/posts/abc");
      expect(result).toEqual(post);
    });
  });

  // ─── Inscrição em evento (PROD-25) ────────────────────────────────────────

  describe("getEventRegistrationSummary", () => {
    it("chama GET .../registrations/summary", async () => {
      const summary = { registration_enabled: true, seats_left: 3 };
      mockAuthenticatedRequest.mockResolvedValue(summary);

      const result = await getEventRegistrationSummary("post-1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/content/posts/post-1/registrations/summary",
      );
      expect(result).toEqual(summary);
    });
  });

  describe("getMyEventRegistration", () => {
    it("chama GET .../registrations/me", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ id: "r1", status: "confirmed" });

      const result = await getMyEventRegistration("post-1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/content/posts/post-1/registrations/me",
      );
      expect(result).toEqual({ id: "r1", status: "confirmed" });
    });

    it("repassa o null de quem ainda não se inscreveu", async () => {
      mockAuthenticatedRequest.mockResolvedValue(null);

      await expect(getMyEventRegistration("post-1")).resolves.toBeNull();
    });
  });

  describe("registerSelfForEvent", () => {
    it("chama POST .../registrations/me sem corpo — nome e pessoa saem do cadastro", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ id: "r1", status: "confirmed" });

      await registerSelfForEvent("post-1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "post",
        "/content/posts/post-1/registrations/me",
      );
    });
  });

  describe("cancelMyEventRegistration", () => {
    it("chama DELETE .../registrations/me", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ id: "r1", status: "cancelled" });

      await cancelMyEventRegistration("post-1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "delete",
        "/content/posts/post-1/registrations/me",
      );
    });
  });

  describe("isPaidRegistration", () => {
    it("reconhece o envelope com pagamento do evento pago", () => {
      expect(
        isPaidRegistration({
          registration: { id: "r1" },
          payment: { qr_code: "000201" },
        } as never),
      ).toBe(true);
    });

    it("não confunde a inscrição crua do evento gratuito com o envelope pago", () => {
      expect(isPaidRegistration({ id: "r1", status: "confirmed" } as never)).toBe(false);
    });
  });
});
