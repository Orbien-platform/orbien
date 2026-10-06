// Testes de EscalaClient — wrappers finos sobre authenticatedRequest.
// Cada teste confirma o path/método/body exatos que a task T5 do
// tasks.md exige (MOB-04, AC 1/2/3).
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import {
  checkIn,
  getMyAssignments,
  getMySwapRequests,
  getMyVolunteerProfile,
  getSwapCandidates,
  getUnavailability,
  requestSwap,
  respondToAssignment,
  respondToSwap,
  saveUnavailability,
} from "./escala-client";

describe("EscalaClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("troca de escala e perfil", () => {
    it("lista os substitutos da escala", async () => {
      await getSwapCandidates("a1");
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/assignments/a1/swap-candidates");
    });

    it("pede troca a um colega, com a mensagem aparada", async () => {
      await requestSwap("a1", "vp2", "  Viagem  ");
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/assignments/a1/swap-requests", {
        body: { target_profile_id: "vp2", message: "Viagem" },
      });
    });

    it("pedido ao ministério vai sem destinatário e sem mensagem em branco", async () => {
      await requestSwap("a1", undefined, "   ");
      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/assignments/a1/swap-requests", {
        body: {},
      });
    });

    it("lista os pedidos, responde e lê o perfil", async () => {
      await getMySwapRequests();
      await respondToSwap("r1", "accept");
      await getMyVolunteerProfile();
      expect(mockAuthenticatedRequest.mock.calls).toEqual([
        ["get", "/volunteers/my-swap-requests"],
        ["patch", "/swap-requests/r1/accept"],
        ["get", "/volunteers/me/profile"],
      ]);
    });
  });

  describe("getMyAssignments", () => {
    it("chama GET /volunteers/my-celebration-assignments sem query quando includePast é omitido", async () => {
      mockAuthenticatedRequest.mockResolvedValue([]);

      await getMyAssignments();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/volunteers/my-celebration-assignments",
      );
    });

    it("repassa includePast=true na query quando informado", async () => {
      mockAuthenticatedRequest.mockResolvedValue([]);

      await getMyAssignments(true);

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/volunteers/my-celebration-assignments?includePast=true",
      );
    });
  });

  describe("respondToAssignment", () => {
    it("chama PATCH /assignments/:id/respond com o status no body", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ id: "a1", status: "confirmed" });

      const result = await respondToAssignment("a1", "confirmed");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("patch", "/assignments/a1/respond", {
        body: { status: "confirmed" },
      });
      expect(result).toEqual({ id: "a1", status: "confirmed" });
    });

    it("também funciona para recusar (declined)", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ id: "a1", status: "declined" });

      await respondToAssignment("a1", "declined");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("patch", "/assignments/a1/respond", {
        body: { status: "declined" },
      });
    });
  });

  describe("checkIn", () => {
    it("chama PATCH /assignments/:id/check-in sem body", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ id: "a1", checked_in_at: "2026-09-08T15:00:00Z" });

      const result = await checkIn("a1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("patch", "/assignments/a1/check-in");
      expect(result).toEqual({ id: "a1", checked_in_at: "2026-09-08T15:00:00Z" });
    });
  });

  describe("getUnavailability", () => {
    it("chama GET /volunteers/unavailability com month e year na query", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ dates: [{ date: "2026-09-10" }] });

      const result = await getUnavailability(9, 2026);

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/volunteers/unavailability?month=9&year=2026",
      );
      expect(result).toEqual({ dates: [{ date: "2026-09-10" }] });
    });
  });

  describe("saveUnavailability", () => {
    it("chama POST /volunteers/unavailability com o shape de CreateUnavailabilityDto", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ dates: [{ date: "2026-09-10" }] });

      const result = await saveUnavailability(9, 2026, ["2026-09-10"], "viagem");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/volunteers/unavailability", {
        body: { referenceMonth: 9, referenceYear: 2026, dates: ["2026-09-10"], notes: "viagem" },
      });
      expect(result).toEqual({ dates: [{ date: "2026-09-10" }] });
    });

    it("funciona sem notes (opcional)", async () => {
      mockAuthenticatedRequest.mockResolvedValue({ dates: [] });

      await saveUnavailability(9, 2026, []);

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/volunteers/unavailability", {
        body: { referenceMonth: 9, referenceYear: 2026, dates: [], notes: undefined },
      });
    });
  });
});
