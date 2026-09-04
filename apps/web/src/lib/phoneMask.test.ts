import { describe, expect, it } from "vitest";
import { applyPhoneMask, initPhone, stripPhone } from "./phoneMask";

describe("applyPhoneMask", () => {
  it("retorna vazio sem dígitos", () => {
    expect(applyPhoneMask("")).toBe("");
    expect(applyPhoneMask("abc")).toBe("");
  });

  it("aplica máscara progressiva conforme a quantidade de dígitos", () => {
    expect(applyPhoneMask("1")).toBe("(1");
    expect(applyPhoneMask("11")).toBe("(11");
    expect(applyPhoneMask("119")).toBe("(11) 9");
    expect(applyPhoneMask("1199999")).toBe("(11) 99999");
    expect(applyPhoneMask("11999999999")).toBe("(11) 99999-9999");
  });

  it("ignora caracteres não numéricos e trunca em 11 dígitos", () => {
    expect(applyPhoneMask("(11) 99999-99999999")).toBe("(11) 99999-9999");
  });
});

describe("stripPhone", () => {
  it("remove tudo que não é dígito", () => {
    expect(stripPhone("(11) 99999-9999")).toBe("11999999999");
    expect(stripPhone("")).toBe("");
  });
});

describe("initPhone", () => {
  it("retorna vazio quando não há valor da API", () => {
    expect(initPhone(undefined)).toBe("");
    expect(initPhone("")).toBe("");
  });

  it("remove o DDI 55 quando presente com mais de 11 dígitos", () => {
    expect(initPhone("5511999999999")).toBe("(11) 99999-9999");
  });

  it("mantém como está quando não há DDI ou o total já é local", () => {
    expect(initPhone("11999999999")).toBe("(11) 99999-9999");
    // Começa com 55 mas tem 11 dígitos ou menos: não é DDI, é local (DDD 55).
    expect(initPhone("55999999999")).toBe("(55) 99999-9999");
  });
});
