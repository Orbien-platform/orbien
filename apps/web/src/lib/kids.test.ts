import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import * as kids from "@/lib/kids";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const patch = vi.mocked(api.patch);
const del = vi.mocked(api.delete);

function axiosError(status: number, data: unknown): AxiosError {
  return new AxiosError("falhou", String(status), undefined, undefined, {
    status,
    data,
    statusText: "",
    headers: {},
    config: {} as never,
  });
}

beforeEach(() => {
  for (const fn of [get, post, patch, del]) {
    fn.mockReset();
    fn.mockResolvedValue({ data: { ok: true } });
  }
});

describe("código de retirada", () => {
  it("normaliza para maiúsculas, só o alfabeto do servidor, até 4 caracteres", () => {
    expect(kids.normalizeCode("a2b3")).toBe("A2B3");
    // 0, O, 1, I e L não existem no alfabeto: somem em vez de virar erro.
    expect(kids.normalizeCode("0O1IL-a b")).toBe("AB");
    expect(kids.normalizeCode("ABCDEFG")).toBe("ABCD");
    expect(kids.normalizeCode("")).toBe("");
  });
});

describe("idade e faixa etária", () => {
  const now = new Date("2026-10-26T12:00:00Z");

  it("conta meses completos e não passa de zero", () => {
    expect(kids.ageInMonths("2024-10-26", now)).toBe(24);
    expect(kids.ageInMonths("2024-10-27", now)).toBe(23);
    expect(kids.ageInMonths("2030-01-01", now)).toBe(0);
    expect(kids.ageInMonths(new Date("2026-09-26"), now)).toBe(1);
  });

  it("usa a data atual quando não recebe `now`", () => {
    expect(kids.ageInMonths("2000-01-01")).toBeGreaterThan(300);
  });

  it("escreve a idade em meses, anos, ou anos e meses", () => {
    expect(kids.formatAge(0)).toBe("0 meses");
    expect(kids.formatAge(1)).toBe("1 mês");
    expect(kids.formatAge(8)).toBe("8 meses");
    expect(kids.formatAge(12)).toBe("1 ano");
    expect(kids.formatAge(24)).toBe("2 anos");
    expect(kids.formatAge(25)).toBe("2 anos e 1 mês");
    expect(kids.formatAge(38)).toBe("3 anos e 2 meses");
  });

  it("escreve a faixa em anos cheios quando a turma é pensada em anos", () => {
    expect(kids.formatAgeRange(24, 71)).toBe("2 a 5 anos");
    expect(kids.formatAgeRange(12, 23)).toBe("1 ano");
    expect(kids.formatAgeRange(24, 35)).toBe("2 anos");
  });

  it("cai para meses quando a faixa não fecha em anos cheios", () => {
    expect(kids.formatAgeRange(6, 23)).toBe("6 a 23 meses");
    expect(kids.formatAgeRange(0, 0)).toBe("0 a 0 meses");
  });
});

describe("leitura de erro", () => {
  it("devolve o code e o status de um erro da API", () => {
    const err = axiosError(422, { code: "OUT_OF_RANGE_CONFIRM" });
    expect(kids.kidsErrorCode(err)).toBe("OUT_OF_RANGE_CONFIRM");
    expect(kids.kidsErrorStatus(err)).toBe(422);
  });

  it("não inventa code nem status quando o erro não é da API ou vem sem corpo", () => {
    expect(kids.kidsErrorCode(new Error("x"))).toBeNull();
    expect(kids.kidsErrorStatus(new Error("x"))).toBeNull();
    expect(kids.kidsErrorCode(axiosError(500, {}))).toBeNull();
    const semResposta = new AxiosError("rede");
    expect(kids.kidsErrorStatus(semResposta)).toBeNull();
  });
});

describe("cliente: cada função fala a rota e o corpo que a API espera", () => {
  const room = {
    name: "Maternal",
    min_age_months: 24,
    max_age_months: 47,
    allows_out_of_range: false,
    capacity: 12,
    min_volunteers: 2,
  };

  it("turmas", async () => {
    get.mockResolvedValueOnce({ data: [{ id: "r1" }] });
    expect(await kids.listRooms()).toEqual([{ id: "r1" }]);
    expect(get).toHaveBeenLastCalledWith("/kids/rooms", { params: undefined });

    get.mockResolvedValueOnce({ data: null });
    expect(await kids.listRooms(true)).toEqual([]);
    expect(get).toHaveBeenLastCalledWith("/kids/rooms", { params: { include_inactive: true } });

    await kids.createRoom(room);
    expect(post).toHaveBeenLastCalledWith("/kids/rooms", room);
    await kids.updateRoom("r1", { is_active: true });
    expect(patch).toHaveBeenLastCalledWith("/kids/rooms/r1", { is_active: true });
    await kids.deactivateRoom("r1");
    expect(del).toHaveBeenLastCalledWith("/kids/rooms/r1");
  });

  it("cultos do dia", async () => {
    get.mockResolvedValueOnce({ data: [{ id: "i1" }] });
    expect(await kids.listInstancesOn("2026-10-25")).toEqual([{ id: "i1" }]);
    expect(get).toHaveBeenLastCalledWith("/celebrations/instances", {
      params: { date_from: "2026-10-25", date_to: "2026-10-25" },
    });
    get.mockResolvedValueOnce({ data: null });
    expect(await kids.listInstancesOn("2026-10-25")).toEqual([]);
  });

  it("sessões e modelo", async () => {
    get.mockResolvedValueOnce({ data: [{ id: "s1" }] });
    expect(await kids.listSessions("i1")).toEqual([{ id: "s1" }]);
    expect(get).toHaveBeenLastCalledWith("/celebrations/instances/i1/kids-sessions");
    get.mockResolvedValueOnce({ data: undefined });
    expect(await kids.listSessions("i1")).toEqual([]);

    await kids.openSessions("i1", ["r1", "r2"]);
    expect(post).toHaveBeenLastCalledWith("/celebrations/instances/i1/kids-sessions", { room_ids: ["r1", "r2"] });
    await kids.cancelSession("s1");
    expect(del).toHaveBeenLastCalledWith("/kids/sessions/s1");

    await kids.getTemplate("c1");
    expect(get).toHaveBeenLastCalledWith("/celebrations/c1/kids-template");
    await kids.setTemplate("c1", ["r1"]);
    expect(post).toHaveBeenLastCalledWith("/celebrations/c1/kids-template", { room_ids: ["r1"] });
    await kids.applyTemplate("c1");
    expect(post).toHaveBeenLastCalledWith("/celebrations/c1/kids-template/apply", {});
  });

  it("criança, responsáveis e consentimento", async () => {
    get.mockResolvedValueOnce({ data: [{ id: "k1" }] });
    expect(await kids.searchChildren("  ana ")).toEqual([{ id: "k1" }]);
    expect(get).toHaveBeenLastCalledWith("/kids/children", { params: { search: "ana" } });
    get.mockResolvedValueOnce({ data: "x" });
    expect(await kids.searchChildren("")).toEqual([]);
    expect(get).toHaveBeenLastCalledWith("/kids/children", { params: undefined });

    await kids.getChild("k1");
    expect(get).toHaveBeenLastCalledWith("/kids/children/k1");
    const input = { full_name: "Ana", birth_date: "2022-01-01", register_consent: true };
    await kids.createChild(input);
    expect(post).toHaveBeenLastCalledWith("/kids/children", input);
    await kids.updateChild("k1", { allergies: null });
    expect(patch).toHaveBeenLastCalledWith("/kids/children/k1", { allergies: null });

    get.mockResolvedValueOnce({ data: [{ id: "p1", full_name: "Maria", phone_masked: "(11) *****-4321" }] });
    expect(await kids.searchGuardians(" mar ")).toEqual([{ id: "p1", full_name: "Maria", phone_masked: "(11) *****-4321" }]);
    expect(get).toHaveBeenLastCalledWith("/kids/guardians/search", { params: { q: "mar" } });
    get.mockResolvedValueOnce({ data: undefined });
    expect(await kids.searchGuardians("xx")).toEqual([]);

    await kids.addGuardian("k1", { full_name: "Vó", phone: "11", relationship: "avó" });
    expect(post).toHaveBeenLastCalledWith("/kids/children/k1/guardians", {
      full_name: "Vó",
      phone: "11",
      relationship: "avó",
    });
    await kids.updateGuardian("g1", { can_pickup: false });
    expect(patch).toHaveBeenLastCalledWith("/kids/guardians/g1", { can_pickup: false });
    await kids.removeGuardian("g1");
    expect(del).toHaveBeenLastCalledWith("/kids/guardians/g1");

    await kids.getConsent("p1");
    expect(get).toHaveBeenLastCalledWith("/kids/consent", { params: { guardian_person_id: "p1" } });
    await kids.registerConsent("p1", "kids-2026-10");
    expect(post).toHaveBeenLastCalledWith("/kids/consent", {
      guardian_person_id: "p1",
      term_version: "kids-2026-10",
    });
    await kids.revokeConsent("p1");
    expect(post).toHaveBeenLastCalledWith("/kids/consent/revoke", { guardian_person_id: "p1" });
  });

  it("check-in, roster, etiquetas e check-out", async () => {
    await kids.checkIn("s1", { child_id: "k1", guardian_person_id: "p1", confirm_out_of_range: true });
    expect(post).toHaveBeenLastCalledWith("/kids/sessions/s1/checkins", {
      child_id: "k1",
      guardian_person_id: "p1",
      confirm_out_of_range: true,
    });
    await kids.getRoster("s1");
    expect(get).toHaveBeenLastCalledWith("/kids/sessions/s1/roster");
    await kids.getLabels("c1");
    expect(get).toHaveBeenLastCalledWith("/kids/checkins/c1/labels");
    await kids.checkOut("c1", { code: "A2B3", picked_up_by_person_id: "p1" });
    expect(post).toHaveBeenLastCalledWith("/kids/checkins/c1/checkout", {
      code: "A2B3",
      picked_up_by_person_id: "p1",
    });
    await kids.checkOutOverride("c1", { reason: "Perdeu a etiqueta", picked_up_by_name: "Maria" });
    expect(post).toHaveBeenLastCalledWith("/kids/checkins/c1/checkout-override", {
      reason: "Perdeu a etiqueta",
      picked_up_by_name: "Maria",
    });
  });

  it("check-in por QR e check-out com o QR no lugar do código", async () => {
    await kids.checkInByQr("s1", { qr: "kidsci1.x.y", confirm_out_of_range: true });
    expect(post).toHaveBeenLastCalledWith("/kids/sessions/s1/checkins/by-qr", {
      qr: "kidsci1.x.y",
      confirm_out_of_range: true,
    });
    await kids.checkOut("c1", { qr: "kidsco1.c1.A2B3.sig", picked_up_by_person_id: "p1" });
    expect(post).toHaveBeenLastCalledWith("/kids/checkins/c1/checkout", {
      qr: "kidsco1.c1.A2B3.sig",
      picked_up_by_person_id: "p1",
    });
  });

  it("indicador", async () => {
    await kids.getAttendanceSummary({ date_from: "2026-08-01", date_to: "2026-10-26" });
    expect(get).toHaveBeenLastCalledWith("/kids/attendance/summary", {
      params: { date_from: "2026-08-01", date_to: "2026-10-26" },
    });
  });
});

describe("parseKidsQr (o que o leitor entrega ao balcão)", () => {
  const ID = "0b9f3c1e-4d2a-4f6b-8c1d-2a3b4c5d6e7f";

  it("reconhece o QR de check-in e devolve o texto inteiro, sem espaços das pontas", () => {
    expect(kids.parseKidsQr(`  kidsci1.${ID}.${"A".repeat(43)}\n`)).toEqual({
      kind: "checkin",
      qr: `kidsci1.${ID}.${"A".repeat(43)}`,
    });
  });

  it("reconhece o QR de check-out e extrai o check-in embutido", () => {
    expect(kids.parseKidsQr(`kidsco1.${ID}.A2B3.abc_-123`)).toEqual({
      kind: "checkout",
      qr: `kidsco1.${ID}.A2B3.abc_-123`,
      checkinId: ID,
    });
  });

  it.each([
    ["vazio", ""],
    ["só espaços", "   "],
    ["lixo", "https://exemplo.com"],
    ["check-in com partes a menos", `kidsci1.${ID}`],
    ["check-in com id que não é UUID", "kidsci1.abc.def"],
    ["check-in sem segredo", `kidsci1.${ID}.`],
    ["check-out sem assinatura", `kidsco1.${ID}.A2B3`],
    ["check-out com código vazio", `kidsco1.${ID}..sig`],
    ["check-out com assinatura vazia", `kidsco1.${ID}.A2B3.`],
    ["check-out com id que não é UUID", "kidsco1.abc.A2B3.sig"],
    ["prefixo desconhecido", `kidsxx1.${ID}.A2B3.sig`],
  ])("não reconhece: %s", (_label, raw) => {
    expect(kids.parseKidsQr(raw)).toBeNull();
  });
});
