// Tokens de design do app — forma executável do STYLE-GUIDE.md deste app
// (que deriva de `orbien-brand-guidelines.md`).
//
// Por que TS e não `tailwind.config.js`: o guia (§6) determina que a cor do
// tenant seja resolvida em runtime pelo ThemeContext, não em build time —
// e o próprio guia (§8, "Comportamento e implementação") prefere resolver o
// papel semântico no contexto a espalhar `dark:` pelas telas. Com as duas
// regras juntas, o que sobraria para o Tailwind seriam as primitivas, que
// é exatamente o que este módulo declara. Os valores abaixo são os mesmos,
// hex a hex, do bloco `theme.extend` do §1 do guia e dos `@theme` de
// `apps/web/src/app/globals.css` — mexer aqui sem mexer nos dois outros
// lugares quebra a sinergia entre web e mobile.
import { Platform, type TextStyle, type ViewStyle } from "react-native";

/** Primitivas de marca (§1 do guia). Nunca referenciar direto em tela —
 * use o papel semântico de `palettes` (§8). As exceções são as cores
 * funcionais, que o tenant não sobrescreve. */
export const brand = {
  navy: "#1E3A7B",
  navyDark: "#162D62",
  navyDim: "#D4DCEF",
  navyDimDark: "#1A2540",

  teal: "#00B8A2",
  tealDark: "#00CDB5",
  tealDim: "#D0F5F1",
  tealDimDark: "#0A2E2A",

  crimson: "#C0392B",
  crimsonDark: "#E05444",
  crimsonDim: "#FDECEA",
  // §9 do guia: sem valor fechado no brand guideline. Escolhido aqui como
  // o crimson rebaixado ao nível de luminância dos outros `*-dim-dark`
  // (navy #1A2540, teal #0A2E2A) — trocar quando design fechar.
  crimsonDimDark: "#3A1815",

  burgundy: "#991B1B",
  burgundyDim: "#F5E6E6",

  ink: "#0F1117",
  parchment: "#F5F4F1",

  surface: "#FFFFFF",
  surfaceDark: "#13151E",

  subtle: "#EEECEA",
  subtleDark: "#1C1F2B",

  stone: "#5C5A56",
  muted: "#9B9893",

  border: "#E0DDD9",
  borderDark: "#232634",
} as const;

/** Papéis semânticos (§8 do guia). Uma tela lê daqui, nunca de `brand`. */
export interface Palette {
  /** Fundo de tela. */
  bgBase: string;
  /** Card, bottom sheet, header. */
  bgSurface: string;
  /** Pressed, fundo de KPI. */
  bgSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  /** Texto sobre `primary`/`accent` — a cor da marca é escura nos dois modos. */
  textOnBrand: string;
  border: string;
  /** Cor funcional: erro é sempre crimson, em qualquer tenant (§6). */
  danger: string;
  dangerDim: string;
  /** Cor funcional de sucesso — teal da plataforma, não do tenant (§6). */
  success: string;
  successDim: string;
  badgeNavyBg: string;
  badgeNavyText: string;
}

const light: Palette = {
  bgBase: brand.parchment,
  bgSurface: brand.surface,
  bgSubtle: brand.subtle,
  textPrimary: brand.ink,
  textSecondary: brand.stone,
  textTertiary: brand.muted,
  textOnBrand: brand.surface,
  border: brand.border,
  danger: brand.crimson,
  dangerDim: brand.crimsonDim,
  success: brand.teal,
  successDim: brand.tealDim,
  badgeNavyBg: brand.navyDim,
  badgeNavyText: brand.navy,
};

const dark: Palette = {
  bgBase: brand.ink,
  bgSurface: brand.surfaceDark,
  bgSubtle: brand.subtleDark,
  textPrimary: brand.parchment,
  textSecondary: brand.muted,
  // §9 do guia: valor ainda não fechado no brand guideline.
  textTertiary: brand.stone,
  textOnBrand: brand.surface,
  border: brand.borderDark,
  danger: brand.crimsonDark,
  dangerDim: brand.crimsonDimDark,
  success: brand.tealDark,
  successDim: brand.tealDimDark,
  badgeNavyBg: brand.navyDimDark,
  badgeNavyText: brand.navyDim,
};

export const palettes = { light, dark } as const;

export type ColorScheme = keyof typeof palettes;

/** Famílias carregadas por `useAppFonts()` (src/lib/theme/fonts.ts). O
 * nome tem que casar com a chave passada ao `useFonts`, senão o RN cai
 * silenciosamente na fonte do sistema. */
export const fontFamily = {
  light: "DMSans_300Light",
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  mono: "DMMono_400Regular",
  monoMedium: "DMMono_500Medium",
} as const;

/** Escala tipográfica (§2 do guia). Sem cor: quem aplica o papel semântico
 * é a tela, porque a cor depende do modo claro/escuro ativo. Mínimo
 * absoluto de 11px — não baixar nem em caption. */
export const typography = {
  display: { fontFamily: fontFamily.light, fontSize: 32, lineHeight: 38 },
  h1: { fontFamily: fontFamily.medium, fontSize: 24, lineHeight: 30 },
  h2: { fontFamily: fontFamily.medium, fontSize: 20, lineHeight: 26 },
  h3: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.light, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  label: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  caption: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 14 },
  mono: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 },
  /** Sempre peso 500, nunca 600 — idêntico ao web (§2). */
  button: { fontFamily: fontFamily.medium, fontSize: 15 },
} satisfies Record<string, TextStyle>;

/** Base 4px (§3). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  btn: 8,
  card: 12,
  modal: 16,
  pill: 999,
  input: 8,
  avatar: 10,
} as const;

/** Área mínima de toque (§3): 44pt iOS / 48dp Android — o guia manda usar
 * 48 como padrão único nas duas plataformas. */
export const touchTarget = 48;

/** Padding horizontal de tela (§3): 16px até 375px, 20px acima. Quem
 * escolhe por largura real é `Screen` (src/components/Screen.tsx). */
export const screenPadding = { compact: 16, regular: 20 } as const;

/** Tamanhos de ícone (§5). Stroke 1.5, sempre outline. */
export const iconSize = {
  /** Inline com texto. */
  inline: 18,
  /** Tab bar inativa. */
  tabInactive: 22,
  /** Ação em card, header. */
  action: 24,
  /** Tab bar ativa, estado vazio. */
  emphasis: 28,
} as const;

export const ICON_STROKE_WIDTH = 1.5;

/** Sombra por plataforma (§4). RN não interpreta `box-shadow` do web.
 * Em dark, sombra pura quase desaparece: Android compensa com +2 de
 * elevation, iOS sobe a opacidade — é o que o guia manda. */
function shadow(
  ios: { height: number; opacity: number; radius: number },
  androidElevation: number,
  isDark: boolean,
): ViewStyle {
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: brand.ink,
        shadowOffset: { width: 0, height: ios.height },
        shadowOpacity: isDark ? 0.35 : ios.opacity,
        shadowRadius: ios.radius,
      },
      default: { elevation: isDark ? androidElevation + 2 : androidElevation },
    }) ?? {}
  );
}

/** `sm` em card de lista, `md` em modal/bottom sheet, `lg` só no FAB. */
export function shadows(isDark: boolean) {
  return {
    sm: shadow({ height: 1, opacity: 0.06, radius: 3 }, 2, isDark),
    md: shadow({ height: 4, opacity: 0.08, radius: 10 }, 6, isDark),
    lg: shadow({ height: 8, opacity: 0.12, radius: 20 }, 12, isDark),
  };
}

export type Shadows = ReturnType<typeof shadows>;
