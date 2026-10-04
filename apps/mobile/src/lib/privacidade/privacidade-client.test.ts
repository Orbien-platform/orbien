const mockRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockRequest(...args),
}));

import {
  cancelDeletion,
  consentLabel,
  exportPersonalData,
  getPersonalData,
  requestDeletion,
  revokeConsent,
  updateMyData,
} from "./privacidade-client";

describe("privacidade-client", () => {
  beforeEach(() => {
    mockRequest.mockReset().mockResolvedValue({});
  });

  it("cada função chama a rota /me certa", async () => {
    await getPersonalData();
    expect(mockRequest).toHaveBeenLastCalledWith("get", "/me/personal-data");
    await exportPersonalData();
    expect(mockRequest).toHaveBeenLastCalledWith("get", "/me/export");
    await updateMyData({ phone: "11" });
    expect(mockRequest).toHaveBeenLastCalledWith("patch", "/me", { body: { phone: "11" } });
    await revokeConsent("member_consent_v1");
    expect(mockRequest).toHaveBeenLastCalledWith("post", "/me/revoke-consent", {
      body: { version: "member_consent_v1" },
    });
    await requestDeletion();
    expect(mockRequest).toHaveBeenLastCalledWith("post", "/me/deletion-request");
    await cancelDeletion();
    expect(mockRequest).toHaveBeenLastCalledWith("delete", "/me/deletion-request");
  });

  it("dá nome legível ao termo e mostra o código quando não conhece", () => {
    expect(consentLabel("visitor_consent_v1")).toBe("Cadastro e contato pela igreja");
    expect(consentLabel("termo_novo_v9")).toBe("termo_novo_v9");
  });
});
