// Testes de formatBRL (PROD-25). O que importa aqui é o formato pt-BR sair
// certo sem `Intl` — ponto no milhar, vírgula no centavo.
import { formatBRL } from "./currency";

describe("formatBRL", () => {
  it("formata valor com centavos", () => {
    expect(formatBRL(49.9)).toBe("R$ 49,90");
  });

  it("mantém os centavos em valor inteiro — 'R$ 50' ao lado de 'R$ 50,00' confundiria", () => {
    expect(formatBRL(50)).toBe("R$ 50,00");
  });

  it("separa o milhar com ponto", () => {
    expect(formatBRL(1234.56)).toBe("R$ 1.234,56");
  });

  it("separa também acima do milhão", () => {
    expect(formatBRL(1234567.89)).toBe("R$ 1.234.567,89");
  });

  it("zero", () => {
    expect(formatBRL(0)).toBe("R$ 0,00");
  });

  it("arredonda a terceira casa em vez de truncá-la", () => {
    expect(formatBRL(0.005)).toBe("R$ 0,01");
  });

  it("valor negativo leva o sinal antes do símbolo", () => {
    expect(formatBRL(-12.3)).toBe("-R$ 12,30");
  });
});
