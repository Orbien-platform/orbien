// Resolução da paleta do tenant (§6 do STYLE-GUIDE.md).
//
// O app roda em duas formas, e as duas usam este mesmo caminho — a única
// diferença é quais camadas estão preenchidas:
//
//   versão genérica       uma build para todos os tenants; a paleta chega
//                         em runtime, no login
//   versão personalizada  build própria por tenant (EAS); a paleta já vem
//                         embutida, e o runtime ainda pode sobrescrever
//
// Cadeia, da menor para a maior precedência:
//
//   1. plataforma  `PLATFORM_THEME` — navy/teal. Sempre completo, é o piso
//                  que garante que nunca existe UI sem tema.
//   2. build       `Constants.expoConfig.extra.brandTheme`, vindo de
//                  ORBIEN_PRIMARY_COLOR/ORBIEN_ACCENT_COLOR (app.config.js).
//                  É a única camada disponível ANTES do login — por isso é
//                  ela que pinta splash e tela de login numa build
//                  personalizada.
//   3. cache       último `GET /settings` bem-sucedido, em AsyncStorage.
//                  Numa build genérica é o que faz o segundo login em
//                  diante já abrir na cor da igreja.
//   4. runtime     `GET /settings` desta sessão. Manda, porque é o único
//                  que reflete uma troca de cor feita agora no admin.
//
// Cada camada é parcial: campo ausente, inválido ou nulo cai para a de
// baixo, nunca para vazio. É o que o AC 2 da história "Tema por tenant"
// exige (tenant sem branding customizado não vê erro nenhum) e o que faz
// uma cor mal cadastrada degradar em vez de quebrar a tela.
import Constants from "expo-constants";

import { isValidHexColor } from "./color";
import { brand } from "./tokens";
import type { Branding } from "./types";

export interface BrandTheme {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  appName: string;
}

/** Camada parcial da cadeia. `undefined` significa "não opina"; para
 * `logoUrl`, `null` também — quem quer apagar o logo de uma camada de
 * baixo não tem esse poder, e não deveria. */
export type BrandThemeLayer = Partial<BrandTheme>;

/** Piso da cadeia — os defaults da plataforma (§1 do guia). O nome do app
 * vem de `Constants.expoConfig` (resolvido por app.config.js a partir de
 * ORBIEN_APP_NAME), nunca de literal (MOB-12 AC 4). */
export const PLATFORM_THEME: BrandTheme = {
  primaryColor: brand.navy,
  accentColor: brand.teal,
  logoUrl: null,
  appName: Constants.expoConfig?.name ?? "",
};

/** Camada 2: a paleta embutida na build. Numa build genérica isto devolve
 * os próprios defaults da plataforma, então a camada é um no-op. */
export function buildTimeLayer(): BrandThemeLayer {
  const fromConfig = Constants.expoConfig?.extra?.brandTheme as
    | { primaryColor?: unknown; accentColor?: unknown }
    | undefined;

  return {
    primaryColor: isValidHexColor(fromConfig?.primaryColor)
      ? fromConfig.primaryColor.trim()
      : undefined,
    accentColor: isValidHexColor(fromConfig?.accentColor)
      ? fromConfig.accentColor.trim()
      : undefined,
  };
}

/**
 * Camadas 3 e 4: o `branding` de `GET /settings` (ou a cópia dele em
 * cache), traduzido para camada.
 *
 * `accent_color` é o campo que a API resolve por congregação e depois por
 * tenant (`ResolvedSettings.branding` em
 * `apps/api/src/settings/settings.service.ts`). Um cache gravado antes de o
 * campo existir simplesmente não opina, e o accent segue vindo da camada de
 * build ou da plataforma.
 *
 * Cor inválida é ignorada em vez de aplicada: é o que garante que uma cor
 * mal cadastrada degrade para a camada de baixo em vez de virar uma tela
 * com CTA ilegível. A validação de verdade é no cadastro, na API
 * (`IsAccessibleBrandColor`).
 */
export function brandingLayer(branding: Branding | null | undefined): BrandThemeLayer {
  if (!branding) return {};

  return {
    primaryColor: isValidHexColor(branding.primary_color)
      ? branding.primary_color.trim()
      : undefined,
    accentColor: isValidHexColor(branding.accent_color)
      ? branding.accent_color.trim()
      : undefined,
    logoUrl: branding.logo_url ?? undefined,
    appName: branding.app_name ?? undefined,
  };
}

/**
 * Só as cores de uma camada — o que continua valendo quando não há sessão.
 *
 * O cache de branding sobrevive ao logout de propósito (é o que faz o
 * segundo login abrir na cor da igreja), mas identidade não é cor: com o
 * cache inteiro aplicado, a tela de login de uma build genérica abria com
 * o NOME e o LOGO do último tenant — dizendo "Doca Church" para quem ainda
 * não disse em que igreja vai entrar. Cor da igreja antes do login é
 * continuidade; nome da igreja antes do login é mentira. Sem sessão, a
 * identidade vem da build (versão personalizada) ou da plataforma.
 */
export function colorsOnly(layer: BrandThemeLayer): BrandThemeLayer {
  return { primaryColor: layer.primaryColor, accentColor: layer.accentColor };
}

/** Aplica as camadas na ordem recebida — a última que opinar sobre um
 * campo ganha. */
export function resolveBrandTheme(...layers: BrandThemeLayer[]): BrandTheme {
  return layers.reduce<BrandTheme>((resolved, layer) => {
    return {
      primaryColor: layer.primaryColor ?? resolved.primaryColor,
      accentColor: layer.accentColor ?? resolved.accentColor,
      logoUrl: layer.logoUrl ?? resolved.logoUrl,
      appName: layer.appName ?? resolved.appName,
    };
  }, PLATFORM_THEME);
}
