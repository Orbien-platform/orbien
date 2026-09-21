// AuthProvider (MOB-01) — contexto React que hidrata a sessão salva no
// SecureStore no boot do app e expõe login/logout/status para as telas.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import {
  getSession,
  login as authLogin,
  logout as authLogout,
  onSessionExpired,
} from "./auth-client";
import { fetchAreas } from "../permissions/permissions-client";
import type { Session } from "./types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  session: Session | null;
  status: AuthStatus;
  /**
   * As áreas do produto que esta sessão lê, segundo `GET /me/permissions`.
   * `null` até a primeira resposta chegar (login ou boot) ou se a chamada
   * falhar — fail-open, quem nega acesso de verdade é a API. Nunca
   * persistida: buscada de novo a cada login/boot, nunca em SecureStore.
   */
  areas: string[] | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [areas, setAreas] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession()
      .then((storedSession) => {
        if (cancelled) return;
        setSession(storedSession);
        setStatus(storedSession ? "authenticated" : "unauthenticated");
        // Não bloqueia a transição de status: a tela já sobe com `areas:
        // null` (fail-open) e atualiza quando a resposta chegar.
        if (storedSession) {
          fetchAreas().then((result) => {
            if (!cancelled) setAreas(result);
          });
        }
      })
      .catch(() => {
        // Leitura do SecureStore falhou (ex.: JSON corrompido) — sem sessão
        // válida para confiar, cai para unauthenticated em vez de travar em
        // "loading" para sempre (AuthGate ficaria preso no splash).
        if (cancelled) return;
        setSession(null);
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // AC 4 da história "Autenticação e sessão": quando uma renovação falha
  // (refresh revogado/expirado) em QUALQUER chamada autenticada do app —
  // não só na que o usuário está olhando —, o SecureStore já foi limpo por
  // `auth-client`; aqui só falta refletir isso no status para o AuthGate
  // (_layout.tsx) redirecionar para /login.
  useEffect(() => {
    return onSessionExpired(() => {
      setSession(null);
      setStatus("unauthenticated");
      setAreas(null);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const newSession = await authLogin(email, password);
    setSession(newSession);
    setStatus("authenticated");
    // Sem `await`, de propósito: não atrasa a transição de tela por causa de
    // uma chamada cujo pior caso já é fail-open (ver `areas` na interface).
    fetchAreas().then(setAreas);
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setSession(null);
    setStatus("unauthenticated");
    setAreas(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, status, areas, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
