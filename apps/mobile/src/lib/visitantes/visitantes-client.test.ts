const mockAuthenticatedRequest = jest.fn();
jest.mock("../auth/auth-client", () => ({
  authenticatedRequest: (...args: unknown[]) => mockAuthenticatedRequest(...args),
}));

import { normalizePhone, registerVisitor } from "./visitantes-client";

describe("normalizePhone", () => {
  it("deixa só os dígitos", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("11999990000");
  });

  it("preserva o + do código do país", () => {
    expect(normalizePhone(" +55 11 99999-0000 ")).toBe("+5511999990000");
  });
});

describe("registerVisitor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticatedRequest.mockResolvedValue({ person: { id: "p1" }, possible_duplicates: [] });
  });

  it("cria a pessoa como visitante, com telefone normalizado", async () => {
    await registerVisitor({ full_name: "  Ana  ", phone: "(11) 99999-0000", email: " a@b.com " });

    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/persons", {
      body: {
        full_name: "Ana",
        classification: "visitor",
        phone: "11999990000",
        email: "a@b.com",
      },
    });
  });

  it("não manda telefone nem e-mail vazios", async () => {
    await registerVisitor({ full_name: "Ana", phone: "", email: "" });

    expect(mockAuthenticatedRequest).toHaveBeenCalledWith("post", "/persons", {
      body: { full_name: "Ana", classification: "visitor" },
    });
  });
});
