// AuthClient (MOB-01) — login, logout, guarda de sessão em
// `expo-secure-store`. Ainda sem a fila de refresh (MOB-02, T11).
//
// `expo-secure-store`, não `AsyncStorage`: token é dado sensível, mesmo
// princípio que já levou o `apps/web` a sair de `localStorage` (ver spec.md,
// Assumptions).
import * as SecureStore from "expo-secure-store";

import { apiClient } from "../api/client";
import { HttpError } from "../api/errors";
import { SessionExpiredError } from "./session-expired-error";
import type { LoginResponse, Session } from "./types";

const SESSION_STORAGE_KEY = "orbien.session";

// Fila de refresh serializada (MOB-02) — espelha a máquina de estados de
// apps/web/src/lib/api.ts:34-64, adaptada para expo-secure-store
// assíncrono: duas chamadas concorrentes a getValidAccessToken() com token
// expirado disparam exatamente uma renovação (Edge Case da spec).
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token?: string): void {
  for (const pending of failedQueue) {
    if (error) pending.reject(error);
    else pending.resolve(token as string);
  }
  failedQueue = [];
}

// Notifica quem precisar reagir a uma sessão encerrada por falha de refresh
// (AC 4 da história "Autenticação e sessão": limpar SecureStore já acontece
// abaixo; navegar para login é responsabilidade de quem assina aqui —
// AuthProvider, que transiciona o status para "unauthenticated").
let sessionExpiredListeners: Array<() => void> = [];

export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.push(listener);
  return () => {
    sessionExpiredListeners = sessionExpiredListeners.filter((l) => l !== listener);
  };
}

function notifySessionExpired(): void {
  for (const listener of sessionExpiredListeners) listener();
}

/**
 * Executa a renovação de fato (chamada a `POST /auth/refresh`), serializada
 * pela mesma fila usada por `getValidAccessToken`. Compartilhado entre o
 * caminho proativo (token expirado pelo relógio local) e o reativo
 * (servidor respondeu 401 antes do relógio local achar que expirou).
 */
async function performRefresh(session: Session): Promise<string> {
  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;
  try {
    const response = await apiClient.post<LoginResponse>("/auth/refresh", {
      body: { refresh_token: session.refreshToken },
    });
    const newSession = toSession(response);
    await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(newSession));
    processQueue(null, newSession.accessToken);
    return newSession.accessToken;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    const sessionExpiredError = new SessionExpiredError();
    processQueue(sessionExpiredError);
    notifySessionExpired();
    throw sessionExpiredError;
  } finally {
    isRefreshing = false;
  }
}

function toSession(response: LoginResponse): Session {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    accessTokenExpiresAt: Date.now() + response.expires_in * 1000,
  };
}

/**
 * `POST /auth/login`. A API já responde com mensagem de erro genérica para
 * credencial errada e tenant não encontrado (mesmo princípio das rotas de
 * plataforma, CLAUDE.md raiz) — este método não tenta distinguir os casos,
 * só repassa o que a API decidiu.
 */
export async function login(
  tenantSlug: string,
  email: string,
  password: string,
): Promise<Session> {
  const response = await apiClient.post<LoginResponse>("/auth/login", {
    body: { tenant_slug: tenantSlug, email, password },
  });
  const session = toSession(response);
  await SecureStore.setItemAsync(SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

/**
 * Lê a sessão do SecureStore, sem chamada de rede. `null` se não houver —
 * inclusive quando o valor salvo está corrompido (JSON inválido de uma
 * versão anterior, por exemplo): trata como "sem sessão" e limpa a chave, em
 * vez de propagar o erro e travar o `AuthGate` em "loading" para sempre.
 */
export async function getSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    return null;
  }
}

/**
 * Chama `POST /auth/logout` best-effort e **sempre** limpa o SecureStore,
 * mesmo se a chamada de rede falhar — nunca deixa o usuário preso logado
 * localmente (design.md, `AuthClient.logout`).
 */
export async function logout(): Promise<void> {
  try {
    const session = await getSession();
    if (session) {
      await apiClient.post("/auth/logout", {
        token: session.accessToken,
        body: { refresh_token: session.refreshToken },
      });
    }
  } catch {
    // best-effort: falha de rede/servidor não impede a limpeza local abaixo.
  } finally {
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
  }
}

/**
 * Usado pelo ApiClient antes de uma chamada autenticada: retorna o access
 * token válido, disparando renovação se expirado. N chamadas concorrentes
 * com token expirado resultam em uma única chamada a `POST /auth/refresh`
 * (fila acima) — as demais aguardam essa Promise em vez de disparar outra.
 */
export async function getValidAccessToken(): Promise<string> {
  const session = await getSession();
  if (!session) throw new SessionExpiredError();

  if (session.accessTokenExpiresAt > Date.now()) {
    return session.accessToken;
  }

  return performRefresh(session);
}

/**
 * Força uma renovação mesmo que o relógio local ainda considere o access
 * token válido — usado por `authenticatedRequest` quando o servidor já
 * respondeu 401 (token revogado antes do prazo, por exemplo). Passa pela
 * mesma fila serializada de `getValidAccessToken`.
 */
async function refreshNow(): Promise<string> {
  const session = await getSession();
  if (!session) throw new SessionExpiredError();
  return performRefresh(session);
}

type AuthenticatedMethod = "get" | "post" | "patch" | "delete";

/**
 * Chamada autenticada de fato usada pelo app (ex.: `ThemeProvider`): obtém
 * um token válido via `getValidAccessToken` (renovação proativa por
 * relógio) e, se o servidor ainda assim responder 401 (token revogado antes
 * do prazo local), força uma renovação e repete a chamada original UMA vez
 * (AC 3 da história "Autenticação e sessão"). Se a renovação falhar, o
 * `SessionExpiredError` sobe para quem chamou — `AuthProvider` está
 * inscrito via `onSessionExpired` para reagir independente do chamador
 * (AC 4: navegar para login, mesmo que o chamador engula o próprio erro).
 */
export async function authenticatedRequest<T>(
  method: AuthenticatedMethod,
  path: string,
  options: { body?: unknown } = {},
): Promise<T> {
  const token = await getValidAccessToken();
  try {
    return await apiClient[method]<T>(path, { token, body: options.body });
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      const refreshedToken = await refreshNow();
      return apiClient[method]<T>(path, { token: refreshedToken, body: options.body });
    }
    throw error;
  }
}
