const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import {
  createSignupQr,
  listSignupQrs,
  normalizePhone,
  recordVisitForExisting,
  registerVisitor,
  registerVisitorAnyway,
  signupUrl,
} from "./visitantes-client";

describe("normalizePhone", () => {
  it("deixa só os dígitos", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("11999990000");
  });

  it("preserva o + do código do país", () => {
    expect(normalizePhone(" +55 11 99999-0000 ")).toBe("+5511999990000");
  });
});

describe("visitantes-client", () => {
  beforeEach(() => {
    mockAuthenticatedRequest.mockReset().mockResolvedValue({ status: "registered" });
  });

  it("cadastra com consentimento, telefone normalizado e só os campos preenchidos", async () => {
    await registerVisitor({
      full_name: "  Ana  ",
      phone: "(11) 99999-0000",
      email: " a@b.com ",
      gender: "female",
      origin: "small_group",
      small_group_id: "g1",
    });

    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/visitors", {
      body: {
        full_name: "Ana",
        origin: "small_group",
        lgpd_consent: true,
        phone: "11999990000",
        email: "a@b.com",
        gender: "female",
        small_group_id: "g1",
      },
    });
  });

  it("não manda telefone nem e-mail vazios", async () => {
    await registerVisitor({ full_name: "Ana", phone: "", email: "", origin: "service" });
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/visitors", {
      body: { full_name: "Ana", origin: "service", lgpd_consent: true },
    });
  });

  it("'é outra pessoa' manda force_new", async () => {
    await registerVisitorAnyway({ full_name: "Ana", origin: "event" });
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/visitors", {
      body: { full_name: "Ana", origin: "event", lgpd_consent: true, force_new: true },
    });
  });

  it("'é a mesma pessoa' registra só a visita", async () => {
    await recordVisitForExisting("p0", "service");
    expect(mockAuthenticatedRequest).toHaveBeenLastCalledWith("post", "/visitors", {
      body: { existing_person_id: "p0", origin: "service", lgpd_consent: true },
    });
    await recordVisitForExisting("p0", "small_group", "g1");
    expect(mockAuthenticatedRequest).toHaveBeenLastCalledWith("post", "/visitors", {
      body: { existing_person_id: "p0", origin: "small_group", lgpd_consent: true, small_group_id: "g1" },
    });
  });
});

describe("QR de autocadastro", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lista por GET /admin/visitor/qr", async () => {
    mockAuthenticatedRequest.mockResolvedValue([]);
    await listSignupQrs();
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("get", "/admin/visitor/qr");
  });

  it("cria com origem e rótulo", async () => {
    mockAuthenticatedRequest.mockResolvedValue({ id: "q1" });
    await createSignupQr("service", "Culto");
    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/admin/visitor/qr", {
      body: { origin: "service", label: "Culto" },
    });
  });

  it("monta a URL da página pública com slug e token", () => {
    expect(signupUrl("https://app.orbien.app/", "teste1-church", "abc")).toBe(
      "https://app.orbien.app/visitante/teste1-church/abc",
    );
  });
});
