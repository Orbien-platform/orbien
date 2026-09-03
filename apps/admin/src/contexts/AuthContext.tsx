"use client";

import {
  createContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
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
  hasPlatformRole,
  PLATFORM_ROLE,
} from "@/lib/auth";

export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export class NotPlatformSupportError extends Error {
  constructor() {
    super("Esta conta não tem acesso ao console da plataforma.");
    this.name = "NotPlatformSupportError";
  }
}

export interface AuthContextType {
  user: PlatformUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, tenantSlug: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- A sessão como store externa --------------------------------------------
//
// A sessão mora no `localStorage`, que não existe no servidor. Copiá-la para
// `useState` dentro de um `useEffect` é o caminho óbvio e é o errado: ou dá
// divergência de hidratação, ou vira o `set-state-in-effect` que o
// `react-hooks` recusa. `useSyncExternalStore` existe exatamente para isto —
// tem snapshot de servidor, então a primeira renderização é igual nos dois
// lados, e a segunda já vê o storage.
//
// O snapshot é uma string, não um objeto: `useSyncExternalStore` compara por
// identidade, e um objeto novo a cada leitura faria loop infinito de render.

const listeners = new Set<() => void>();

/** Chamado por quem escreve na sessão (login, logout). */
export function emitSessionChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` cobre duas abas do console abertas: logout numa derruba a outra
  // sem esperar a próxima requisição levar 401.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

// O separador é um espaço porque nem token JWT nem e-mail contêm espaço.
function getSessionSnapshot(): string {
  return `${getAccessToken() ?? ""} ${getUserEmail() ?? ""}`;
}

/** No servidor não há sessão — e não pode haver, ou a hidratação briga. */
function getServerSessionSnapshot(): string {
  return " ";
}

function alwaysHydrated(): boolean {
  return true;
}

function neverHydratedOnServer(): boolean {
  return false;
}

function buildUser(token: string, email: string): PlatformUser | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  return {
    id: payload.sub,
    name: email.split("@")[0].replace(/[._-]/g, " "),
    email,
    roles: payload.roles,
  };
}

// --- Provider ---------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const snapshot = useSyncExternalStore(
    subscribe,
    getSessionSnapshot,
    getServerSessionSnapshot
  );

  // `true` só depois da hidratação. Enquanto for `false`, o layout mostra o
  // spinner em vez de concluir que ninguém está logado.
  const isHydrated = useSyncExternalStore(
    subscribe,
    alwaysHydrated,
    neverHydratedOnServer
  );

  const user = useMemo(() => {
    const [token, email] = snapshot.split(" ");
    // Token expirado não derruba a sessão: o interceptor do Axios troca pelo
    // refresh na primeira chamada. O que derruba é a ausência de
    // `platform_support`, e isso não muda por renovação de token.
    if (!token || !email || !hasPlatformRole(token)) return null;
    return buildUser(token, email);
  }, [snapshot]);

  /**
   * O login é o mesmo `POST /auth/login` do `apps/web`, e por isso ainda pede
   * o slug do tenant: a conta de suporte é uma `user_accounts` como qualquer
   * outra, e `user_accounts` é única por (tenant_id, email). O que este app
   * acrescenta é a checagem do papel — sem `platform_support` no token não faz
   * sentido entrar, porque todas as telas responderiam 403.
   */
  const login = useCallback(
    async (email: string, password: string, tenantSlug: string) => {
      const { data } = await api.post<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }>("/auth/login", { email, password, tenant_slug: tenantSlug });

      if (!hasPlatformRole(data.access_token)) {
        // A credencial é válida — só não é de plataforma. Encerrar o refresh
        // token recém-criado evita deixar sessão pendurada no banco por uma
        // tentativa que não vai a lugar nenhum.
        await api
          .post("/auth/logout", { refresh_token: data.refresh_token })
          .catch(() => undefined);
        throw new NotPlatformSupportError();
      }

      saveTokens(data.access_token, data.refresh_token, email);
      emitSessionChange();
      router.push("/tenants");
    },
    [router]
  );

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await api.post("/auth/logout", { refresh_token: refreshToken });
    } catch {
      // Limpa o estado local de qualquer forma.
    }
    clearTokens();
    emitSessionChange();
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({
      user,
      isLoading: !isHydrated,
      isAuthenticated: !!user,
      login,
      logout,
    }),
    [user, isHydrated, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export { PLATFORM_ROLE };
