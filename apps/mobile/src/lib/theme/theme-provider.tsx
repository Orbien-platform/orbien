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
import Constants from "expo-constants";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import { authenticatedRequest } from "../auth/auth-client";
import { useAuth } from "../auth/auth-provider";
import { brand, palettes, shadows, type ColorScheme, type Palette, type Shadows } from "./tokens";
import type { Branding } from "./types";

const BRANDING_STORAGE_KEY = "orbien.branding";
const SCHEME_STORAGE_KEY = "orbien.colorScheme";

// Nome do app vem de Constants.expoConfig (resolvido por app.config.js),
// nunca literal (MOB-12 AC 4 — mesmo princípio de src/app/index.tsx).
const DEFAULT_APP_NAME = Constants.expoConfig?.name ?? "";

/** Só `primary` (e opcionalmente `accent`) são customizáveis pelo tenant —
 * cor funcional (erro, sucesso) nunca é (§6 do guia). */
export interface ThemeBranding {
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  appName: string;
}

/** Tema padrão — usado quando não há cache nem branding customizado do
 * tenant (AC 2: nunca deixa a UI sem tema, nunca expõe erro). */
export const DEFAULT_THEME: ThemeBranding = {
  primaryColor: brand.navy,
  accentColor: brand.teal,
  logoUrl: null,
  appName: DEFAULT_APP_NAME,
};

/** Preferência do usuário (§8): segue o sistema por padrão, com override
 * manual na tela de Perfil. */
export type ThemePreference = "system" | "light" | "dark";

const THEME_PREFERENCES: readonly ThemePreference[] = ["system", "light", "dark"];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference);
}

export interface ThemeValue extends ThemeBranding {
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

function toBranding(branding: Branding): ThemeBranding {
  return {
    primaryColor: branding.primary_color ?? DEFAULT_THEME.primaryColor,
    // A API ainda não expõe accent por tenant (`Branding` em ./types.ts não
    // tem o campo); cai no teal da plataforma, que é o fallback previsto
    // pelo §6 do guia.
    accentColor: DEFAULT_THEME.accentColor,
    logoUrl: branding.logo_url ?? DEFAULT_THEME.logoUrl,
    appName: branding.app_name ?? DEFAULT_THEME.appName,
  };
}

const FALLBACK: ThemeValue = {
  ...DEFAULT_THEME,
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
  const [branding, setBranding] = useState<ThemeBranding>(DEFAULT_THEME);
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    let cancelled = false;

    // Reaplica o tema cacheado antes de qualquer chamada de rede completar
    // (AC 3) — lido e aplicado de imediato, sem esperar o GET /settings.
    AsyncStorage.getItem(BRANDING_STORAGE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const cachedBranding = JSON.parse(raw) as Branding;
        setBranding(toBranding(cachedBranding));
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
        setBranding(toBranding(resolved.branding));
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

    return {
      ...branding,
      scheme,
      isDark,
      preference,
      setPreference,
      colors: palettes[scheme],
      shadow: shadows(isDark),
    };
  }, [branding, preference, systemScheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
