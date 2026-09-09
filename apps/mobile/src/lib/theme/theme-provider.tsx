// ThemeProvider (T15, MOB-03) — tema por tenant (white-label dinâmico) e
// modo claro/escuro.
//
// Duas responsabilidades que o STYLE-GUIDE.md manda juntar aqui:
//
// 1. Branding do tenant (§6): no boot, reaplica o branding cacheado em
//    AsyncStorage antes de qualquer chamada de rede completar (AC 3 da
//    história "Tema por tenant" no spec.md), dispara `GET /settings` em
//    paralelo; em sucesso, atualiza o tema e regrava o cache; em falha de
//    rede ou tenant sem branding customizado, mantém o tema padrão sem
//    nenhum erro visível (AC 2).
//
// 2. Papéis semânticos de cor (§8): o guia é explícito que resolver o
//    papel já correto aqui é melhor do que espalhar `dark:`/condicional
//    por toda tela. Quem consome lê `colors.textPrimary`, nunca
//    `brand.ink` — é isso que permite trocar de modo sem tocar em tela
//    nenhuma.
//
// A cor do tenant NÃO muda entre claro e escuro (§8, última regra): é a
// marca da igreja nos dois modos; o que muda é a superfície em volta.
//
// AsyncStorage, não expo-secure-store: branding não é segredo (design.md,
// Tech Decisions) — reserva SecureStore só para token (auth-client.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { authenticatedRequest } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";
import {
  brandingLayer,
  buildTimeLayer,
  PLATFORM_THEME,
  resolveBrandTheme,
  type BrandTheme,
  type BrandThemeLayer,
} from "./brand-theme";
import { meetsAA, readableOn } from "./color";
import { palettes, shadows, type ColorScheme, type Palette, type Shadows } from "./tokens";
import type { Branding } from "./types";

const BRANDING_STORAGE_KEY = "orbien.branding";
const SCHEME_STORAGE_KEY = "orbien.colorScheme";

/** Só `primary` (e opcionalmente `accent`) são customizáveis pelo tenant —
 * cor funcional (erro, sucesso) nunca é (§6 do guia). */
export type ThemeBranding = BrandTheme;

/** Tema padrão — o piso da cadeia de `./brand-theme.ts`, usado quando não
 * há paleta de build, nem cache, nem branding customizado do tenant (AC 2:
 * nunca deixa a UI sem tema, nunca expõe erro). */
export const DEFAULT_THEME: ThemeBranding = PLATFORM_THEME;

/** Preferência do usuário (§8): segue o sistema por padrão, com override
 * manual na tela de Perfil. */
export type ThemePreference = "system" | "light" | "dark";

const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference);
}

export interface ThemeValue extends ThemeBranding {
  /**
   * `accentColor` quando ele passa AA sobre `colors.bgSurface`; senão,
   * `primaryColor`.
   *
   * É o que ícone/label de destaque sobre superfície deve usar (tab bar
   * ativa, §5). O teal default dá ~2.4:1 sobre branco, abaixo do AA de
   * 4.5:1 que o §8 exige, e o label da tab bar tem 11px — então na paleta
   * da plataforma isto resolve para o navy. Uma versão personalizada que
   * escolha um accent com contraste próprio passa a usá-lo, sem mudar
   * nenhuma tela.
   */
  accentReadable: string;
  /** Modo efetivamente ativo, já resolvido (`system` virou claro ou escuro). */
  scheme: ColorScheme;
  isDark: boolean;
  /** O que o usuário escolheu — `system` inclusive. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Papéis semânticos do modo ativo (§8). */
  colors: Palette;
  /** Sombra já compensada para o modo ativo (§4). */
  shadow: Shadows;
}

interface ResolvedSettings {
  branding: Branding;
}

const FALLBACK: ThemeValue = {
  ...DEFAULT_THEME,
  accentReadable: DEFAULT_THEME.primaryColor,
  scheme: "light",
  isDark: false,
  preference: "system",
  setPreference: () => {},
  colors: palettes.light,
  shadow: shadows(false),
};

const ThemeContext = createContext<ThemeValue>(FALLBACK);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const systemScheme = useColorScheme();
  // Camadas 3 e 4 da cadeia (./brand-theme.ts) guardadas separadas de
  // propósito: a de runtime vencendo a de cache é o que faz uma troca de
  // cor no admin aparecer sem esperar o próximo boot, e guardar só o
  // resultado já mesclado perderia essa distinção.
  const [cachedLayer, setCachedLayer] = useState<BrandThemeLayer>({});
  const [runtimeLayer, setRuntimeLayer] = useState<BrandThemeLayer>({});
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;

    // Reaplica o tema cacheado antes de qualquer chamada de rede completar
    // (AC 3) — lido e aplicado de imediato, sem esperar o GET /settings.
    AsyncStorage.getItem(BRANDING_STORAGE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const cachedBranding = JSON.parse(raw) as Branding;
        setCachedLayer(brandingLayer(cachedBranding));
      } catch {
        // cache corrompido: ignora, segue com o default até a rede resolver.
      }
    });

    if (!session) return () => {
      cancelled = true;
    };

    authenticatedRequest<ResolvedSettings>("get", "/settings")
      .then((resolved) => {
        if (cancelled) return;
        setRuntimeLayer(brandingLayer(resolved.branding));
        AsyncStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(resolved.branding)).catch(() => {
          // falha ao gravar cache não é visível ao usuário — próxima
          // resposta bem-sucedida tenta gravar de novo.
        });
      })
      .catch(() => {
        // falha de rede ou 5xx: mantém o tema atual (cache ou default),
        // sem nenhum erro visível (AC 2).
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Preferência de modo é local do aparelho, não do tenant — por isso lida
  // fora do efeito de branding, e sem nunca gravar no boot (só a escolha
  // explícita do usuário grava).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SCHEME_STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !isThemePreference(raw)) return;
        setPreferenceState(raw);
      })
      .catch(() => {
        // sem preferência legível: segue o sistema.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(SCHEME_STORAGE_KEY, next).catch(() => {
      // não persistiu: vale para esta sessão do app, sem erro visível.
    });
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme: ColorScheme =
      preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
    const isDark = scheme === "dark";
    const palette = palettes[scheme];

    // `PLATFORM_THEME` é a semente do reduce; daqui para a direita, quem
    // opina depois ganha.
    const branding = resolveBrandTheme(buildTimeLayer(), cachedLayer, runtimeLayer);

    return {
      ...branding,
      accentReadable: meetsAA(branding.accentColor, palette.bgSurface)
        ? branding.accentColor
        : branding.primaryColor,
      scheme,
      isDark,
      preference,
      setPreference,
      colors: {
        ...palette,
        // Medido, não fixo: `palettes` declara branco, que quebra num
        // tenant de cor clara (amarelo pastel é o exemplo do §8). Aqui a
        // cor de texto sobre a marca é a que tem mais contraste com a cor
        // que o tenant escolheu — é o que permite a paleta mudar de
        // verdade sem cada tela saber disso.
        textOnBrand: readableOn(branding.primaryColor),
      },
      shadow: shadows(isDark),
    };
  }, [cachedLayer, runtimeLayer, preference, systemScheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
