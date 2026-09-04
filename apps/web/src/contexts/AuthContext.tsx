"use client";

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import type { SessionUser } from "@/lib/session";

/**
 * A sessão vista pela árvore de componentes.
 *
 * Nada aqui toca token: os três verbos falam com `/api/session`, que é quem
 * guarda a credencial em cookie `HttpOnly`. O usuário chega pronto do
 * servidor, decodificado lá — antes ele era montado no cliente a partir do
 * JWT em `localStorage`, que é justamente o que deixou de existir.
 */

export type AuthUser = SessionUser;

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let ativo = true;

    axios
      .get<{ user: AuthUser | null }>("/api/session")
      .then(({ data }) => {
        if (ativo) setUser(data.user);
      })
      .catch(() => {
        // 401 é resposta legítima: ninguém logado. As telas protegidas já
        // foram barradas pelo middleware antes de chegar aqui.
      })
      .finally(() => {
        if (ativo) setIsLoading(false);
      });

    return () => {
      ativo = false;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string, tenantSlug: string) => {
      const { data } = await axios.post<{ user: AuthUser }>("/api/session", {
        email,
        password,
        tenant_slug: tenantSlug,
      });
      setUser(data.user);
      router.push("/dashboard");
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await axios.delete("/api/session");
    } catch {
      // Limpar o estado local não pode depender da API estar de pé.
    }
    setUser(null);
    // Carga inteira, não `router.push`: garante que nada renderizado sob a
    // sessão anterior sobreviva em cache de cliente. Vale dobrado quando a
    // sessão era de suporte, dentro de igreja alheia.
    window.location.replace("/login");
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
