// AuthClient (MOB-01) — login, logout, guarda de sessão em
// `expo-secure-store`. Ainda sem a fila de refresh (MOB-02, T11).
//
// `expo-secure-store`, não `AsyncStorage`: token é dado sensível, mesmo
// princípio que já levou o `apps/web` a sair de `localStorage` (ver spec.md,
// Assumptions).
import * as SecureStore from "expo-secure-store";

import { apiClient } from "../api/client";
import type { LoginResponse, Session } from "./types";

const SESSION_STORAGE_KEY = "orbien.session";

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

/** Lê a sessão do SecureStore, sem chamada de rede. `null` se não houver. */
export async function getSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as Session;
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
