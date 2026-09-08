// ThemeProvider (T15, MOB-03) — tema por tenant (white-label dinâmico).
//
// No boot, reaplica o branding cacheado em AsyncStorage antes de qualquer
// chamada de rede completar (AC 3 da história "Tema por tenant" no
// spec.md), dispara `GET /settings` em paralelo; em sucesso, atualiza o
// tema e regrava o cache; em falha de rede ou tenant sem branding
// customizado, mantém o tema padrão sem nenhum erro visível (AC 2).
//
// AsyncStorage, não expo-secure-store: branding não é segredo (design.md,
// Tech Decisions) — reserva SecureStore só para token (auth-client.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import React, { createContext, useContext, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { useAuth } from "../auth/auth-provider";
import type { Branding } from "./types";

const BRANDING_STORAGE_KEY = "orbien.branding";

// Nome do app vem de Constants.expoConfig (resolvido por app.config.js),
// nunca literal (MOB-12 AC 4 — mesmo princípio de src/app/index.tsx).
const DEFAULT_APP_NAME = Constants.expoConfig?.name ?? "";

/** Tema padrão — usado quando não há cache nem branding customizado do
 * tenant (AC 2: nunca deixa a UI sem tema, nunca expõe erro). */
export const DEFAULT_THEME: ThemeValue = {
  primaryColor: "#1e3a7b",
  logoUrl: null,
  appName: DEFAULT_APP_NAME,
};

export interface ThemeValue {
  primaryColor: string;
  logoUrl: string | null;
  appName: string;
}

interface ResolvedSettings {
  branding: Branding;
}

function toThemeValue(branding: Branding): ThemeValue {
  return {
    primaryColor: branding.primary_color ?? DEFAULT_THEME.primaryColor,
    logoUrl: branding.logo_url ?? DEFAULT_THEME.logoUrl,
    appName: branding.app_name ?? DEFAULT_THEME.appName,
  };
}

const ThemeContext = createContext<ThemeValue>(DEFAULT_THEME);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [theme, setTheme] = useState<ThemeValue>(DEFAULT_THEME);

  useEffect(() => {
    let cancelled = false;

    // Reaplica o tema cacheado antes de qualquer chamada de rede completar
    // (AC 3) — lido e aplicado de imediato, sem esperar o GET /settings.
    AsyncStorage.getItem(BRANDING_STORAGE_KEY).then((raw) => {
      if (cancelled || !raw) return;
      try {
        const cachedBranding = JSON.parse(raw) as Branding;
        setTheme(toThemeValue(cachedBranding));
      } catch {
        // cache corrompido: ignora, segue com o default até a rede resolver.
      }
    });

    if (!session) return () => {
      cancelled = true;
    };

    apiClient
      .get<ResolvedSettings>("/settings", { token: session.accessToken })
      .then((resolved) => {
        if (cancelled) return;
        setTheme(toThemeValue(resolved.branding));
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

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
