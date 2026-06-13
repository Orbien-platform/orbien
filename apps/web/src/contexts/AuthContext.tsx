"use client";

import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import {
  saveTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getUserEmail,
  decodeJwtPayload,
  isTokenExpired,
} from "@/lib/auth";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  tenant_id: string;
  congregation_id: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

function buildUserFromToken(token: string, email: string): AuthUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  // Name: derive from email prefix until a better endpoint is available
  const name = email.split("@")[0].replace(/[._-]/g, " ");
  return {
    id: payload.sub,
    name,
    email,
    roles: payload.roles,
    tenant_id: payload.tenant_id,
    congregation_id: payload.congregation_id,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const initAuth = () => {
      const token = getAccessToken();
      const email = getUserEmail();
      if (!token || !email) {
        setIsLoading(false);
        return;
      }
      if (isTokenExpired(token)) {
        // Expired — the Axios interceptor will refresh on the first API call.
        // Still build user from stored token so the shell renders immediately.
        const u = buildUserFromToken(token, email);
        setUser(u);
        setIsLoading(false);
        return;
      }
      const u = buildUserFromToken(token, email);
      setUser(u);
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = useCallback(
    async (email: string, password: string, tenantSlug: string) => {
      const { data } = await api.post<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }>("/auth/login", { email, password, tenant_slug: tenantSlug });

      saveTokens(data.access_token, data.refresh_token, email);
      const u = buildUserFromToken(data.access_token, email);
      setUser(u);
      router.push("/dashboard");
    },
    [router]
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await api.post("/auth/logout", { refresh_token: refreshToken });
    } catch {
      // Clear local state regardless
    }
    clearTokens();
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: !!user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
