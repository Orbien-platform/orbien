// Matemática de cor para o white-label (§6 e §8 do STYLE-GUIDE.md).
//
// Existe porque a paleta do tenant é dado de entrada, não constante: numa
// versão personalizada a cor da marca vem de fora (env de build ou
// `GET /settings`) e pode ser qualquer coisa — inclusive clara. Sem isto,
// "texto sobre a cor da marca" seria branco fixo, e um tenant de amarelo
// pastel teria CTA ilegível. O guia manda validar AA (4.5:1); aqui o
// front escolhe o par legível em vez de aceitar o ilegível em silêncio.
//
// Fórmula de luminância relativa e de razão de contraste: WCAG 2.1.
import { brand } from "./tokens";

/** `#RGB` ou `#RRGGBB`. Rejeita o resto — inclusive `rgb()` e nome de cor,
 * que a plataforma aceitaria mas de que não se consegue medir contraste
 * sem parser próprio. */
const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_PATTERN.test(value.trim());
}

function toChannels(hex: string): { r: number; g: number; b: number } {
  const raw = hex.trim().slice(1);
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Luminância relativa WCAG (0 = preto, 1 = branco). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = toChannels(hex);
  const linear = [r, g, b].map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** Razão de contraste WCAG entre duas cores, de 1 (igual) a 21 (preto no
 * branco). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** AA para texto normal (§8 do guia): 4.5:1. */
export const AA_CONTRAST = 4.5;

export function meetsAA(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= AA_CONTRAST;
}

/**
 * Cor de texto/ícone legível sobre `background`: o parchment da marca ou o
 * ink, o que tiver mais contraste.
 *
 * Não é "branco se escuro, preto se claro" com um limiar chutado — é a
 * razão de contraste medida dos dois candidatos, que é o que o §8 exige e
 * o que acerta nos meios-tons (um azul médio pode ficar abaixo de 4.5:1
 * com os dois; aí o melhor dos dois ainda é a resposta certa, e quem
 * bloqueia a cor é o cadastro, no backend).
 */
export function readableOn(background: string): string {
  if (!isValidHexColor(background)) return brand.surface;
  return contrastRatio(brand.surface, background) >= contrastRatio(brand.ink, background)
    ? brand.surface
    : brand.ink;
}
