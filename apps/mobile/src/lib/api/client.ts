// Cliente HTTP base do app (MOB-01) — wrapper de `fetch`, sem lógica de
// refresh ainda (isso é AuthClient, T10/T11, para evitar dependência
// circular: AuthClient usa ApiClient, não o contrário).
//
// Base URL nunca hardcoded: vem de `Constants.expoConfig.extra.apiUrl`,
// mesmo princípio do MOB-12 aplicado à URL da API (design.md, Components).
import Constants from "expo-constants";

import { HttpError, NetworkError } from "./errors";

export interface RequestOptions {
  /** Access token a injetar como `Authorization: Bearer`, quando houver. */
  token?: string;
  body?: unknown;
}

function getBaseUrl(): string {
  const apiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (typeof apiUrl !== "string" || apiUrl.length === 0) {
    // Falha alto: sem isso, toda chamada viraria fetch('' + path) — uma URL
    // relativa sem origem em React Native — e o erro apareceria como falha
    // de rede genérica, escondendo que o build profile não configurou
    // extra.apiUrl (app.config.js/eas.json).
    throw new Error(
      "apiUrl não configurada em Constants.expoConfig.extra — verifique app.config.js/eas.json",
    );
  }
  return apiUrl;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;

  // Fora do try/catch de baixo de propósito: erro de config (apiUrl
  // ausente) não é erro de rede — misturar os dois faria o app tratar uma
  // config quebrada como se fosse "sem internet" (NetworkError), escondendo
  // a causa real.
  const url = `${getBaseUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (cause) {
    throw new NetworkError(cause);
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    throw new HttpError(response.status, body);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, options),
  post: <T>(path: string, options?: RequestOptions) => request<T>("POST", path, options),
  patch: <T>(path: string, options?: RequestOptions) => request<T>("PATCH", path, options),
  delete: <T>(path: string, options?: RequestOptions) => request<T>("DELETE", path, options),
};
