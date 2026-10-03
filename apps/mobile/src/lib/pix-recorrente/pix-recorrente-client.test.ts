// PixRecorrenteClient (PROD-28): o que importa é a direção da falha da
// trava — fechada, ao contrário de `fetchAreas` — e o parse do valor
// digitado, que decide o que vai para a cobrança.
const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import {
  CONSENT_VERSION,
  createMySubscription,
  fetchAsaasPaymentsEnabled,
  parseAmount,
} from "./pix-recorrente-client";

describe("fetchAsaasPaymentsEnabled", () => {
  beforeEach(() => jest.clearAllMocks());

  it("true só quando a API diz exatamente true", async () => {
    mockAuthenticatedRequest.mockResolvedValue({ areas: [], features: { asaas_payments: true } });
    await expect(fetchAsaasPaymentsEnabled()).resolves.toBe(true);
  });

  it.each([
    ["desligada", { features: { asaas_payments: false } }],
    ["sem features (API antiga)", { areas: [] }],
    ["valor não booleano", { features: { asaas_payments: "true" } }],
  ])("false quando a resposta vem %s", async (_label, body) => {
    mockAuthenticatedRequest.mockResolvedValue(body);
    await expect(fetchAsaasPaymentsEnabled()).resolves.toBe(false);
  });

  it("falha de rede ou HTTP vira false (fail-closed), sem lançar", async () => {
    mockAuthenticatedRequest.mockRejectedValue(new Error("rede"));
    await expect(fetchAsaasPaymentsEnabled()).resolves.toBe(false);
  });
});

describe("createMySubscription", () => {
  it("manda só valor e versão do aceite — nunca a pessoa", async () => {
    mockAuthenticatedRequest.mockResolvedValue({ id: "sub-1" });

    await createMySubscription(150);

    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/me/pix-subscriptions", {
      body: { amount: 150, consent_version: CONSENT_VERSION },
    });
  });
});

describe("parseAmount", () => {
  it.each([
    ["150", 150],
    ["150,5", 150.5],
    ["150,50", 150.5],
    ["1.500,00", 1500],
    [" 80 ", 80],
  ])("%s → %s", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it.each(["", "abc", "10,123", "-5", "1,2,3"])("%s não é valor", (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});
