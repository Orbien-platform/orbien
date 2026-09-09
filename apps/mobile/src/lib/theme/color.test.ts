// Matemática de cor do white-label (src/lib/theme/color.ts). Os valores de
// referência são os da tabela do §8 do STYLE-GUIDE.md e os pares
// conhecidos do WCAG (preto no branco = 21:1).
import {
  AA_CONTRAST,
  contrastRatio,
  isValidHexColor,
  meetsAA,
  readableOn,
  relativeLuminance,
} from "./color";
import { brand } from "./tokens";

describe("isValidHexColor", () => {
  it("aceita #RGB e #RRGGBB, em qualquer caixa", () => {
    expect(isValidHexColor("#fff")).toBe(true);
    expect(isValidHexColor("#1E3A7B")).toBe(true);
    expect(isValidHexColor("#1e3a7b")).toBe(true);
    expect(isValidHexColor("  #1e3a7b  ")).toBe(true);
  });

  it("rejeita o que não se consegue medir sem parser próprio", () => {
    expect(isValidHexColor("rgb(30, 58, 123)")).toBe(false);
    expect(isValidHexColor("navy")).toBe(false);
    expect(isValidHexColor("#12345")).toBe(false);
    expect(isValidHexColor("1e3a7b")).toBe(false);
    expect(isValidHexColor(null)).toBe(false);
    expect(isValidHexColor(undefined)).toBe(false);
    expect(isValidHexColor(0x1e3a7b)).toBe(false);
  });
});

describe("relativeLuminance", () => {
  it("vai de 0 (preto) a 1 (branco)", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("forma curta e longa do mesmo hex dão o mesmo valor", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(relativeLuminance("#ffffff"), 10);
  });
});

describe("contrastRatio", () => {
  it("preto no branco é 21:1 e a razão não depende da ordem", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2);
  });

  it("cor contra ela mesma é 1:1", () => {
    expect(contrastRatio(brand.navy, brand.navy)).toBeCloseTo(1, 5);
  });
});

describe("meetsAA", () => {
  it("o navy da marca passa AA sobre branco (é o CTA default)", () => {
    expect(meetsAA(brand.surface, brand.navy)).toBe(true);
  });

  it("o teal da marca NÃO passa AA sobre branco — é o desvio do §5 do guia", () => {
    // Documenta a razão de a tab bar ativa usar primary e não accent.
    expect(contrastRatio(brand.teal, brand.surface)).toBeLessThan(AA_CONTRAST);
    expect(meetsAA(brand.teal, brand.surface)).toBe(false);
  });

  it("o par texto/fundo do §8 passa AA nos dois modos", () => {
    expect(meetsAA(brand.ink, brand.parchment)).toBe(true);
    expect(meetsAA(brand.parchment, brand.ink)).toBe(true);
    expect(meetsAA(brand.ink, brand.surface)).toBe(true);
    expect(meetsAA(brand.parchment, brand.surfaceDark)).toBe(true);
  });
});

describe("readableOn", () => {
  it("cor de marca escura recebe texto claro", () => {
    expect(readableOn(brand.navy)).toBe(brand.surface);
    expect(readableOn("#000000")).toBe(brand.surface);
  });

  it("cor de marca clara recebe texto escuro — o caso que o branco fixo quebrava", () => {
    // Amarelo pastel: o exemplo que o §8 do guia dá como o que mais falha.
    expect(readableOn("#FDE68A")).toBe(brand.ink);
    expect(readableOn("#ffffff")).toBe(brand.ink);
  });

  it("escolhe pelo contraste medido, não por um limiar de claro/escuro", () => {
    const background = "#00B8A2"; // teal: claro o suficiente para pedir ink
    const chosen = readableOn(background);
    expect(contrastRatio(chosen, background)).toBeGreaterThanOrEqual(
      contrastRatio(chosen === brand.ink ? brand.surface : brand.ink, background),
    );
  });

  it("valor inválido cai no branco, sem lançar", () => {
    expect(readableOn("navy")).toBe(brand.surface);
    expect(readableOn("")).toBe(brand.surface);
  });
});
