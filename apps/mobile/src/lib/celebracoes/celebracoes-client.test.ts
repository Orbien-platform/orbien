// Testes de CelebracoesClient — wrapper fino sobre authenticatedRequest.
// Cobre as duas funções da task T3 (tasks.md), MOB-08-01/02/06.
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import { getServiceOrder, listUpcomingInstances } from "./celebracoes-client";

describe("CelebracoesClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listUpcomingInstances", () => {
    it("chama GET /celebrations/instances com date_from igual à data de hoje (MOB-08-06)", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-09-09T14:00:00Z"));
      mockAuthenticatedRequest.mockResolvedValue([]);

      await listUpcomingInstances();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith(
        "get",
        "/celebrations/instances?date_from=2026-09-09",
      );
      jest.useRealTimers();
    });

    it("retorna a lista resolvida pelo authenticatedRequest", async () => {
      const instances = [{ id: "i1" }];
      mockAuthenticatedRequest.mockResolvedValue(instances);

      const result = await listUpcomingInstances();

      expect(result).toEqual(instances);
    });
  });

  describe("getServiceOrder", () => {
    it("chama GET /celebrations/orders/:id com o id informado", async () => {
      const order = { id: "ord1", title: "Culto de Domingo" };
      mockAuthenticatedRequest.mockResolvedValue(order);

      const result = await getServiceOrder("ord1");

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/celebrations/orders/ord1");
      expect(result).toEqual(order);
    });
  });
});
