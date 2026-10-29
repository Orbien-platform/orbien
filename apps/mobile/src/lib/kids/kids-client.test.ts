// Testes do KidsClient (T30): path/método/body exatos de cada rota e os
// helpers puros (idade, turma sugerida, código de erro).
const mockRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockRequest(...args),
}));

import { HttpError, NetworkError } from "../api/errors";
import {
  acceptConsent,
  addGuardian,
  ageInMonths,
  checkInChild,
  checkOut,
  checkOutOverride,
  createChild,
  describeKidsActionError,
  formatCountdown,
  issueCheckinQr,
  formatAge,
  getChild,
  getConsentStatus,
  getOpenCheckin,
  getRoster,
  isInRange,
  kidsErrorCode,
  listChildren,
  listOpenSessions,
  removeGuardian,
  revokeConsent,
  suggestSession,
  updateGuardian,
} from "./kids-client";
import type { KidsSession } from "./types";

const room = (over: Partial<KidsSession["room"]> = {}): KidsSession["room"] => ({
  id: "r",
  name: "Maternal",
  min_age_months: 12,
  max_age_months: 35,
  allows_out_of_range: false,
  capacity: null,
  ...over,
});
const session = (id: string, r: Partial<KidsSession["room"]>, status: KidsSession["status"] = "open"): KidsSession => ({
  id,
  status,
  room: room(r),
});

describe("KidsClient", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lista filhos sem busca e com busca codificada e aparada", async () => {
    await listChildren();
    await listChildren("  Ana Lú ");
    await listChildren("   ");
    expect(mockRequest.mock.calls).toEqual([
      ["get", "/kids/children"],
      ["get", "/kids/children?search=Ana%20L%C3%BA"],
      ["get", "/kids/children"],
    ]);
  });

  it("lê a ficha e cadastra criança", async () => {
    const input = { full_name: "Ana", birth_date: "2022-03-04", allergies: "amendoim" };
    await getChild("c1");
    await createChild(input);
    expect(mockRequest.mock.calls).toEqual([
      ["get", "/kids/children/c1"],
      ["post", "/kids/children", { body: input }],
    ]);
  });

  it("adiciona, edita e remove autorizado", async () => {
    await addGuardian("c1", { full_name: "Vó", phone: "1199", relationship: "avó", can_pickup: true });
    await updateGuardian("g1", { can_pickup: false });
    await removeGuardian("g1");
    expect(mockRequest.mock.calls).toEqual([
      ["post", "/kids/children/c1/guardians", { body: { full_name: "Vó", phone: "1199", relationship: "avó", can_pickup: true } }],
      ["patch", "/kids/guardians/g1", { body: { can_pickup: false } }],
      ["delete", "/kids/guardians/g1"],
    ]);
  });

  it("consulta, aceita e revoga o consentimento", async () => {
    await getConsentStatus();
    await acceptConsent("kids-2026-10");
    await revokeConsent();
    expect(mockRequest.mock.calls).toEqual([
      ["get", "/kids/consent"],
      ["post", "/kids/consent", { body: { term_version: "kids-2026-10" } }],
      ["post", "/kids/consent/revoke", { body: {} }],
    ]);
  });

  it("lista as sessões abertas de hoje e faz check-in com o corpo do contrato", async () => {
    await listOpenSessions();
    await checkInChild("s1", { child_id: "c1", guardian_person_id: "p1", confirm_out_of_range: true });
    expect(mockRequest.mock.calls).toEqual([
      ["get", "/kids/sessions/open"],
      ["post", "/kids/sessions/s1/checkins", { body: { child_id: "c1", guardian_person_id: "p1", confirm_out_of_range: true } }],
    ]);
  });

  it("lê o roster e fecha o check-out com código em caixa alta e nome aparado", async () => {
    await getRoster("s1");
    await checkOut("k1", { code: " ab3k ", picked_up_by_name: "  Maria  " });
    await checkOutOverride("k1", { reason: " Esqueceu o código ", picked_up_by_name: " Maria " });
    expect(mockRequest.mock.calls).toEqual([
      ["get", "/kids/sessions/s1/roster"],
      ["post", "/kids/checkins/k1/checkout", { body: { code: "AB3K", picked_up_by_name: "Maria" } }],
      ["post", "/kids/checkins/k1/checkout-override", { body: { reason: "Esqueceu o código", picked_up_by_name: "Maria" } }],
    ]);
  });

  describe("getOpenCheckin", () => {
    it("devolve o check-in aberto", async () => {
      mockRequest.mockResolvedValue({ id: "k1", code: "7KQ2" });
      await expect(getOpenCheckin("c1")).resolves.toEqual({ id: "k1", code: "7KQ2" });
      expect(mockRequest).toHaveBeenCalledWith("get", "/kids/children/c1/checkin");
    });

    it("404 é 'sem check-in aberto', não erro", async () => {
      mockRequest.mockRejectedValue(new HttpError(404, {}));
      await expect(getOpenCheckin("c1")).resolves.toBeNull();
    });

    it("outro erro propaga", async () => {
      mockRequest.mockRejectedValue(new NetworkError());
      await expect(getOpenCheckin("c1")).rejects.toBeInstanceOf(NetworkError);
    });
  });

  describe("kidsErrorCode", () => {
    it("lê o code do corpo do HttpError", () => {
      expect(kidsErrorCode(new HttpError(422, { code: "kids_consent_required" }))).toBe("kids_consent_required");
    });
    it("é nulo sem code ou fora de HttpError", () => {
      expect(kidsErrorCode(new HttpError(500, undefined))).toBeNull();
      expect(kidsErrorCode(new Error("x"))).toBeNull();
    });
  });

  describe("idade e turma", () => {
    const now = new Date("2026-10-26T12:00:00Z");

    it("conta meses completos", () => {
      expect(ageInMonths("2024-07-26T00:00:00Z", now)).toBe(27);
      expect(ageInMonths("2024-07-27T00:00:00Z", now)).toBe(26);
      expect(ageInMonths("2030-01-01T00:00:00Z", now)).toBe(0);
    });

    it("escreve a idade como o responsável fala", () => {
      expect(formatAge(1)).toBe("1 mês");
      expect(formatAge(8)).toBe("8 meses");
      expect(formatAge(12)).toBe("1 ano");
      expect(formatAge(27)).toBe("2 anos e 3 meses");
      expect(formatAge(37)).toBe("3 anos e 1 mês");
    });

    it("sugere a turma cuja faixa contém a idade", () => {
      const sessions = [session("a", { min_age_months: 0, max_age_months: 11 }), session("b", {})];
      expect(suggestSession(sessions, 20)?.id).toBe("b");
      expect(isInRange(sessions[1], 20)).toBe(true);
      expect(isInRange(sessions[1], 40)).toBe(false);
    });

    it("fora de toda faixa, sugere a primeira que aceita; senão nenhuma; ignora cancelada", () => {
      const strict = session("a", {});
      const lenient = session("b", { allows_out_of_range: true });
      expect(suggestSession([strict, lenient], 60)?.id).toBe("b");
      expect(suggestSession([strict], 60)).toBeNull();
      expect(suggestSession([session("c", {}, "cancelled")], 20)).toBeNull();
    });
  });
});

describe("describeKidsActionError", () => {
  it("repete a regra recusada pela API (400/409/422)", () => {
    expect(describeKidsActionError(new HttpError(422, { message: "A criança precisa de um responsável principal" }), "x")).toBe(
      "A criança precisa de um responsável principal",
    );
  });

  it("cai no texto da tela quando não há mensagem, quando é 500 ou rede", () => {
    expect(describeKidsActionError(new HttpError(422, undefined), "falhou")).toBe("falhou");
    expect(describeKidsActionError(new HttpError(500, { message: "boom" }), "falhou")).toBe("falhou");
    expect(describeKidsActionError(new NetworkError(), "falhou")).toBe("falhou");
  });
});

describe("QR de check-in do responsável (MOB-1)", () => {
  beforeEach(() => mockRequest.mockReset());

  it("emite o QR pelo filho com POST /kids/children/:id/qr", async () => {
    const issued = {
      qr: "kidsci1.t.s",
      child_id: "c1",
      guardian_person_id: "p1",
      expires_at: "2026-10-29T12:05:00.000Z",
      ttl_seconds: 300,
    };
    mockRequest.mockResolvedValue(issued);
    await expect(issueCheckinQr("c1")).resolves.toEqual(issued);
    expect(mockRequest).toHaveBeenCalledWith("post", "/kids/children/c1/qr", { body: {} });
  });

  it("deixa o 409 (criança já presente) chegar à tela", async () => {
    mockRequest.mockRejectedValue(new HttpError(409, { message: "A criança já está presente" }));
    await expect(issueCheckinQr("c1")).rejects.toBeInstanceOf(HttpError);
  });

  it("escreve o que falta como minutos:segundos, arredondando para cima e sem negativo", () => {
    expect(formatCountdown(300_000)).toBe("5:00");
    expect(formatCountdown(272_400)).toBe("4:33");
    expect(formatCountdown(9_000)).toBe("0:09");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5_000)).toBe("0:00");
  });
});
