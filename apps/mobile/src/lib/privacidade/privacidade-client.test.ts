const mockRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockRequest(...args),
}));

import {
  cancelDeletion,
  consentLabel,
  exportPersonalData,
  getMyPersonId,
  getPersonalData,
  getProfileGaps,
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

  it("getMyPersonId devolve o id da pessoa da conta, não o da conta", async () => {
    mockRequest.mockResolvedValue({ person: { id: "person-9" } });
    await expect(getMyPersonId()).resolves.toBe("person-9");
    expect(mockRequest).toHaveBeenLastCalledWith("get", "/me/personal-data");
  });

  it("dá nome legível ao termo e mostra o código quando não conhece", () => {
    expect(consentLabel("visitor_consent_v1")).toBe("Cadastro e contato pela igreja");
    expect(consentLabel("termo_novo_v9")).toBe("termo_novo_v9");
  });

  describe("getProfileGaps", () => {
    it("devolve o que falta no cadastro", async () => {
      mockRequest.mockResolvedValue({ missing: ["gender", "phone"] });
      await expect(getProfileGaps()).resolves.toEqual(["gender", "phone"]);
      expect(mockRequest).toHaveBeenLastCalledWith("get", "/me/profile-gaps");
    });

    it("resposta malformada ou falha de rede: nada a pedir, sem lançar", async () => {
      mockRequest.mockResolvedValue({});
      await expect(getProfileGaps()).resolves.toEqual([]);
      mockRequest.mockResolvedValue(null);
      await expect(getProfileGaps()).resolves.toEqual([]);
      mockRequest.mockRejectedValue(new Error("offline"));
      await expect(getProfileGaps()).resolves.toEqual([]);
    });
  });
});
