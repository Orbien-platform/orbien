// Tokens de design do app — forma executável do STYLE-GUIDE.md deste app,
// na direção "Órbita" (v2, docs/design/orbita-v2/README.md).
//
// Por que TS e não `tailwind.config.js`: o guia determina que a cor do
// tenant seja resolvida em runtime pelo ThemeContext, não em build time —
// e prefere resolver o papel semântico no contexto a espalhar `dark:` pelas
// telas. Com as duas regras juntas, o que sobraria para o Tailwind seriam
// as primitivas, que é exatamente o que este módulo declara. Os valores
// abaixo são os mesmos, hex a hex, de `apps/web/src/app/globals.css` (tema
// claro em `:root`, escuro em `.dark`) — mexer aqui sem mexer lá quebra a
// sinergia entre web e mobile.
//
// Nome antigo, valor novo: as chaves são as da v1 (`navy`, `teal`, `ink`,
// `surfaceDark`…) para que nenhuma tela precise mudar para herdar a Órbita.
import { Platform, type TextStyle, type ViewStyle } from "react-native";

/** Primitivas de marca. Nunca referenciar direto em tela — use o papel
 * semântico de `palettes`. As exceções são as cores funcionais, que o
 * tenant não sobrescreve. */
export const brand = {
  /** Cor padrão da igreja (`--brand`) — o tenant a substitui em runtime. */
  navy: "#1E3A7B",
  /** Brilho da marca: glows e anéis da órbita. */
  navyGlow: "#2B4FA8",
  navyDark: "#162D62",
  navyDim: "#E4E8F1",
  /** `color-mix(navy 28%, #05070F)` — fundo suave da marca no escuro. */
  navyDimDark: "#0D1530",
  /** `color-mix(navy 45%, branco)` — texto em cor da marca no escuro. */
  navyInkDark: "#9AA8C8",

  /** Teal é da Orbien e não muda com a igreja. */
  teal: "#00B8A2",
  tealDark: "#00E5C7",
  /** Teal como texto no claro — o #00B8A2 não passa AA sobre branco. */
  tealInk: "#007F70",
  tealDim: "#D0F5F1",
  tealDimDark: "rgba(0, 229, 199, 0.12)",

  amber: "#D4A437",
  amberInk: "#8A6512",
  amberDark: "#F2C766",
  amberDim: "#F7EDD3",
  amberDimDark: "rgba(242, 199, 102, 0.12)",

  crimson: "#C0392B",
  crimsonInk: "#A52F23",
  crimsonDark: "#FF7A6B",
  crimsonDim: "#FDECEA",
  crimsonDimDark: "rgba(255, 122, 107, 0.12)",

  burgundy: "#991B1B",
  burgundyDim: "#F5E6E6",

  ink: "#0F1117",
  /** Fundo do tema escuro — o "céu" da Órbita. */
  night: "#05070F",
  parchment: "#F4F3EF",
  /** Texto principal no escuro. */
  snow: "#F2F1EE",

  surface: "#FFFFFF",
  surfaceDark: "#0B0F1D",

  subtle: "#ECEBE6",
  subtleDark: "#121729",

  stone: "#5C5A56",
  stoneDark: "#A9AEBD",
  muted: "#8A8782",
  mutedDark: "#6C7286",

  border: "#E2E0DA",
  borderStrong: "#C8C5C0",
  borderDark: "rgba(255, 255, 255, 0.08)",
  borderStrongDark: "rgba(255, 255, 255, 0.16)",
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
  /** Atenção (amber): prazo perto, pendência. Cor funcional, como as duas
   * acima. */
  warning: string;
  warningDim: string;
  /** Borda forte: campo, segmentado, botão secundário. */
  borderStrong: string;
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
  // Teal como texto no claro é o `tealInk`: o #00B8A2 não passa AA.
  success: brand.tealInk,
  successDim: brand.tealDim,
  warning: brand.amberInk,
  warningDim: brand.amberDim,
  borderStrong: brand.borderStrong,
  badgeNavyBg: brand.navyDim,
  badgeNavyText: brand.navy,
};

/** Escuro é o padrão da Órbita. Elevação por borda, não por sombra. */
const dark: Palette = {
  bgBase: brand.night,
  bgSurface: brand.surfaceDark,
  bgSubtle: brand.subtleDark,
  textPrimary: brand.snow,
  textSecondary: brand.stoneDark,
  textTertiary: brand.mutedDark,
  textOnBrand: brand.surface,
  border: brand.borderDark,
  danger: brand.crimsonDark,
  dangerDim: brand.crimsonDimDark,
  success: brand.tealDark,
  successDim: brand.tealDimDark,
  warning: brand.amberDark,
  warningDim: brand.amberDimDark,
  borderStrong: brand.borderStrongDark,
  badgeNavyBg: brand.navyDimDark,
  badgeNavyText: brand.navyInkDark,
};

export const palettes = { light, dark } as const;

export type ColorScheme = keyof typeof palettes;

/** Famílias carregadas por `useAppFonts()` (src/lib/theme/fonts.ts). O
 * nome tem que casar com a chave passada ao `useFonts`, senão o RN cai
 * silenciosamente na fonte do sistema. */
export const fontFamily = {
  light: "Geist_300Light",
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
} as const;

/** Escala tipográfica da Órbita. Sem cor: quem aplica o papel semântico é a
 * tela, porque a cor depende do modo claro/escuro ativo. Mínimo absoluto de
 * 11px — não baixar nem em caption. */
export const typography = {
  // Títulos em Geist Medium, com tracking fechado (igual ao `page-title` do web).
  display: { fontFamily: fontFamily.medium, fontSize: 36, lineHeight: 40, letterSpacing: -0.9 },
  h1: { fontFamily: fontFamily.medium, fontSize: 30, lineHeight: 34, letterSpacing: -0.75 },
  h2: { fontFamily: fontFamily.medium, fontSize: 24, lineHeight: 28, letterSpacing: -0.6 },
  // h3 é título de card/linha — fica em Geist, que lê melhor em 16px.
  h3: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  // Rótulo da Órbita: Geist Mono em caixa alta, tracking .14em (11px ×
  // .14 ≈ 1.5). A caixa alta é do estilo, não do texto — a string continua
  // em caixa normal, para leitor de tela e para os testes.
  label: {
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  caption: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 14 },
  mono: { fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 },
  /** Sempre peso 500, nunca 600 — idêntico ao web. */
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

/** Forma da Órbita: botão, badge e segmentado em pill; card de 16–20px no
 * app (18 aqui); campo de 10px. */
export const radius = {
  btn: 999,
  card: 18,
  modal: 20,
  pill: 999,
  input: 10,
  avatar: 10,
} as const;

/** Alturas de botão da Órbita no produto: 30 / 36 / 46. O padrão do app é o
 * de 46 — e o `touchTarget` completa a área de toque com `hitSlop`. */
export const buttonHeight = { sm: 30, md: 36, lg: 46 } as const;

/** Área mínima de toque (§3): 44pt iOS / 48dp Android — o guia manda usar
 * 48 como padrão único nas duas plataformas. */
export const touchTarget = 48;

/** Padding horizontal de tela (§3): 16px até 375px, 20px acima. Quem
 * escolhe por largura real é `Screen` (src/components/Screen.tsx). */
export const screenPadding = { compact: 16, regular: 20 } as const;

/** Véu sobre foto para texto claro por cima (carrossel da home). É `ink` a
 * 55%: escurece o bastante para o título ler em qualquer foto, nos dois
 * modos, sem apagar a imagem. */
export const scrim = "rgba(5, 7, 15, 0.55)";

/** Toque em superfície de foto: escurece levemente. O `bg-subtle` que o Card
 * usa no pressed (§8) não aparece por baixo de uma imagem. */
export const pressedImageOpacity = 0.9;

/** Indicador de página do carrossel: ponto inativo e o ativo, esticado. */
export const pagerDot = { size: 6, activeWidth: 16 } as const;

/** Filete à esquerda de citação no corpo do post. */
export const quoteRuleWidth = 3;

/** Tamanhos de ícone. Traço de 1.6, estilo Lucide, sempre outline. */
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

export const ICON_STROKE_WIDTH = 1.6;

/** Sombra por plataforma. RN não interpreta `box-shadow` do web.
 *
 * Na Órbita a elevação no escuro é borda + brilho, quase sem sombra: o card
 * de lista fica sem sombra (a borda `border` faz o papel), e só o que flutua
 * de verdade (modal, bottom sheet, FAB) ganha a sombra funda do README
 * (`0 30px 80px rgba(0,0,0,.6)`). */
function shadow(
  ios: { height: number; opacity: number; radius: number },
  androidElevation: number,
): ViewStyle {
  // Com `default`, o `select` sempre devolve um dos dois.
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: ios.height },
      shadowOpacity: ios.opacity,
      shadowRadius: ios.radius,
    },
    default: { elevation: androidElevation },
  })!;
}

/** `sm` em card de lista, `md` em modal/bottom sheet, `lg` só no FAB. */
export function shadows(isDark: boolean) {
  if (isDark) {
    return {
      sm: {} as ViewStyle,
      md: shadow({ height: 16, opacity: 0.5, radius: 30 }, 10),
      lg: shadow({ height: 30, opacity: 0.6, radius: 40 }, 16),
    };
  }
  return {
    sm: shadow({ height: 1, opacity: 0.06, radius: 3 }, 2),
    md: shadow({ height: 4, opacity: 0.08, radius: 10 }, 6),
    lg: shadow({ height: 8, opacity: 0.12, radius: 20 }, 12),
  };
}

export type Shadows = ReturnType<typeof shadows>;

/** Anéis concêntricos da órbita (assinatura visual da v2): o raio de cada
 * anel, em px, e a volta do satélite teal. */
export const orbit = {
  rings: [90, 150, 220],
  satelliteSize: 6,
  /** 26s por volta, linear, infinito — mesma cadência do site e do painel. */
  periodMs: 26000,
} as const;

/** QR na tela (check-in e autocadastro). Módulo escuro sobre placa branca
 * nos dois modos: câmera de celular lê mal QR invertido (claro sobre
 * escuro), então a placa não segue o tema. `quietZone` é a margem em
 * módulos que a norma do QR pede em volta do código (4). */
export const qr = {
  plate: brand.surface,
  module: brand.ink,
  quietZone: 4,
  /** Lado máximo do QR, em px: em tablet ou projetado, maior não lê melhor. */
  maxSize: 340,
  /** Moldura do leitor: o quadro onde o membro encaixa o QR do líder. */
  scanFrame: 240,
  scanFrameBorder: 3,
  /** Véu escuro em volta da moldura, sobre a imagem da câmera. */
  scanScrim: "rgba(5, 7, 15, 0.6)",
  /** Texto e moldura sobre a imagem da câmera: claro nos dois modos, como
   * o texto sobre foto do carrossel. */
  scanInk: brand.snow,
} as const;

/** Barra de tempo restante do QR de check-in. */
export const progressBarHeight = 6;

/** Selo de "deu certo" em tela inteira (check-in confirmado): o círculo e
 * o ícone dentro dele. */
export const successMark = { halo: 72, icon: 36 } as const;
