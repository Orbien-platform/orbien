// AuthProvider (MOB-01) — contexto React que hidrata a sessão salva no
// SecureStore no boot do app e expõe login/logout/status para as telas.
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { getSession, login as authLogin, logout as authLogout } from "./auth-client";
import type { Session } from "./types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  session: Session | null;
  status: AuthStatus;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    getSession().then((storedSession) => {
      if (cancelled) return;
      setSession(storedSession);
      setStatus(storedSession ? "authenticated" : "unauthenticated");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (tenantSlug: string, email: string, password: string) => {
    const newSession = await authLogin(tenantSlug, email, password);
    setSession(newSession);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    await authLogout();
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ session, status, login, logout }}>
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
