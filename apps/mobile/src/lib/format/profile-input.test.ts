import { isValidPhone, maskBirthDate, maskPhone, parseBirthDate, phoneDigits } from "./profile-input";

describe("maskPhone", () => {
  it("formata celular e fixo, e ignora o que não é dígito", () => {
    expect(maskPhone("11988887777")).toBe("(11) 98888-7777");
    expect(maskPhone("1133334444")).toBe("(11) 33334-444");
    expect(maskPhone("(11) 9")).toBe("(11) 9");
    expect(maskPhone("")).toBe("");
    expect(maskPhone("119888877779999")).toBe("(11) 98888-7777");
  });
  it("valida 10 ou 11 dígitos", () => {
    expect(isValidPhone("(11) 98888-7777")).toBe(true);
    expect(isValidPhone("1133334444")).toBe(true);
    expect(isValidPhone("(11) 9888")).toBe(false);
    expect(phoneDigits("(11) 98888-7777")).toBe("11988887777");
  });
});

describe("birth date", () => {
  const now = new Date(2026, 9, 17);
  it("mascara enquanto digita", () => {
    expect(maskBirthDate("0")).toBe("0");
    expect(maskBirthDate("010")).toBe("01/0");
    expect(maskBirthDate("01011990")).toBe("01/01/1990");
    expect(maskBirthDate("010119901234")).toBe("01/01/1990");
  });
  it("converte para ISO", () => {
    expect(parseBirthDate("01/05/1990", now)).toBe("1990-05-01");
    expect(parseBirthDate("29/02/2000", now)).toBe("2000-02-29");
    expect(parseBirthDate("17/10/2026", now)).toBe("2026-10-17");
  });
  it("rejeita incompleta, inexistente, futura e anterior a 1900", () => {
    expect(parseBirthDate("01/05/19", now)).toBeNull();
    expect(parseBirthDate("29/02/2001", now)).toBeNull();
    expect(parseBirthDate("31/04/1990", now)).toBeNull();
    expect(parseBirthDate("18/10/2026", now)).toBeNull();
    expect(parseBirthDate("01/01/1899", now)).toBeNull();
  });
});
