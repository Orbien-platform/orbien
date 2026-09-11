// Testes de NotificationPreferencesClient (MOB-10a, T10 do tasks.md) —
// wrapper fino sobre authenticatedRequest, mesmo molde de
// content-client.test.ts.
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "./notification-preferences-client";

describe("NotificationPreferencesClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getNotificationPreferences", () => {
    it("chama GET /me/notification-preferences", async () => {
      const prefs = { avisos: true, oracao: true, eventos: true, devocional: true };
      mockAuthenticatedRequest.mockResolvedValue(prefs);

      const result = await getNotificationPreferences();

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/me/notification-preferences");
      expect(result).toEqual(prefs);
    });
  });

  describe("updateNotificationPreferences", () => {
    it("chama PATCH /me/notification-preferences com o patch informado no body", async () => {
      const updated = { avisos: true, oracao: false, eventos: true, devocional: true };
      mockAuthenticatedRequest.mockResolvedValue(updated);

      const result = await updateNotificationPreferences({ oracao: false });

      expect(mockAuthenticatedRequest).toHaveBeenCalledWith("patch", "/me/notification-preferences", {
        body: { oracao: false },
      });
      expect(result).toEqual(updated);
    });
  });
});
