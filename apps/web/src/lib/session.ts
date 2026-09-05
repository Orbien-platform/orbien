/**
 * A sessão do web, do lado do servidor.
 *
 * Os tokens moram em cookie `HttpOnly` e nunca chegam ao JavaScript da página:
 * quem os anexa às chamadas é o proxy em `/api-proxy`, que roda no servidor do
 * Next. `localStorage` guardava os mesmos tokens ao alcance de qualquer script
 * carregado na origem — um XSS lia a credencial inteira. Cookie `HttpOnly` não
 * fecha o XSS, mas troca "roubar a credencial e usar de qualquer lugar" por
 * "agir de dentro da aba enquanto ela existe", que é bem menos.
 *
 * `SameSite=Lax` é o que impede o `/api-proxy` de virar deputado confuso: com
 * o cookie viajando sozinho, um POST de outro site levaria a sessão junto.
 * Lax não envia o cookie em requisição cross-site que não seja navegação de
 * topo — e navegação de topo só faz GET, cuja resposta o atacante não lê,
 * porque não há CORS liberando a origem dele.
 *
 * Este módulo só é importado por Route Handlers e pelo middleware. Nada aqui
 * pode entrar em componente de cliente.
 */

import type { JwtPayload } from "./auth";
import type { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";

export const ACCESS_COOKIE = "orbien_at";
export const REFRESH_COOKIE = "orbien_rt";
/** Dados de exibição da sessão (e-mail, igreja da sessão de suporte). */
export const IDENTITY_COOKIE = "orbien_id";

/** 7 dias — o mesmo prazo do refresh token emitido pela API. */
export const REFRESH_MAX_AGE = 7 * 24 * 60 * 60;

export const BACKEND_URL =
  process.env.API_BACKEND_URL ?? "http://localhost:3000/api";

export interface Identity {
  email: string;
  /** Nome da igreja, só em sessão de suporte. */
  tenantName?: string;
}

interface CookieJar {
  set: ResponseCookies["set"];
  delete: ResponseCookies["delete"];
}

const base = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

/**
 * `maxAge` é do chamador, e não o `expires_in` do token, porque os dois casos
 * querem coisas diferentes.
 *
 * Sessão normal grava com o prazo do refresh (7 dias): o cookie precisa
 * sobreviver ao vencimento do token para que `GET /api/session` ainda consiga
 * ler o payload e montar a tela enquanto o interceptor renova na primeira
 * chamada. Era o que o `localStorage` fazia de graça.
 *
 * Sessão de suporte grava com o prazo do próprio token, que é o prazo dela:
 * sem refresh para renovar, cookie vencido é sessão acabada, e o middleware
 * manda para `/login` antes de renderizar qualquer coisa.
 */
export function setAccessCookie(
  jar: CookieJar,
  token: string,
  maxAge: number
): void {
  jar.set(ACCESS_COOKIE, token, { ...base, maxAge });
}

export function setRefreshCookie(jar: CookieJar, token: string): void {
  jar.set(REFRESH_COOKIE, token, { ...base, maxAge: REFRESH_MAX_AGE });
}

export function setIdentityCookie(jar: CookieJar, identity: Identity): void {
  jar.set(IDENTITY_COOKIE, encodeURIComponent(JSON.stringify(identity)), {
    ...base,
    maxAge: REFRESH_MAX_AGE,
  });
}

export function clearSessionCookies(jar: CookieJar): void {
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
  jar.delete(IDENTITY_COOKIE);
}

export function readIdentity(raw: string | undefined): Identity | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as Identity;
  } catch {
    return null;
  }
}

/** O que o cliente pode saber da sessão. Nunca inclui token. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
  tenant_id: string;
  congregation_id: string;
  support_session: boolean;
  support_tenant_name: string | null;
  /**
   * Quando a sessão de suporte expira, em epoch ms. Nulo em sessão normal.
   *
   * Só faz sentido para a sessão de suporte porque só ela não se renova: o
   * token de `POST /auth/impersonate` vem sem refresh token, de propósito, e
   * vale 5 minutos. Numa sessão comum o `exp` do access token não diz nada ao
   * usuário — a fila de `/api/session/refresh` o renova por baixo —, e expor
   * um relógio ali seria contar uma coisa que não acontece.
   */
  support_expires_at: number | null;
}

/**
 * Monta o usuário a partir do token e do cookie de identidade.
 *
 * O nome sai do prefixo do e-mail porque a API ainda não expõe endpoint de
 * perfil — era assim antes de a sessão virar cookie, e continua sendo.
 */
export function buildSessionUser(
  payload: JwtPayload,
  identity: Identity
): SessionUser {
  return {
    id: payload.sub,
    name: identity.email.split("@")[0].replace(/[._-]/g, " "),
    email: identity.email,
    roles: payload.roles,
    tenant_id: payload.tenant_id,
    congregation_id: payload.congregation_id,
    support_session: payload.support_session === true,
    support_tenant_name: identity.tenantName ?? null,
    support_expires_at:
      payload.support_session === true && typeof payload.exp === "number"
        ? payload.exp * 1000
        : null,
  };
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Roda a rotação do refresh token contra a API e regrava os cookies.
 *
 * A API revoga a família inteira ao ver um refresh token reusado — é detecção
 * de roubo, e é certa. O efeito colateral é que duas rotações concorrentes
 * derrubam a sessão: a segunda apresenta um token que a primeira acabou de
 * revogar. Por isso a rotação **não** acontece dentro do proxy, onde N
 * requisições paralelas tomariam 401 juntas, nem em `GET /api/session`, que
 * roda na montagem de *cada* aba: ela tem um endpoint próprio, e quem
 * serializa é a fila que já existe no interceptor do Axios.
 *
 * A fila é por aba. Duas abas abrindo juntas depois de 15 minutos paradas
 * ainda podem colidir — é limitação anterior a esta mudança, herdada de
 * quando o token estava em `localStorage`, e só some com trava compartilhada
 * do lado do servidor.
 */
export async function rotate(refreshToken: string): Promise<TokenPair | null> {
  const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  return (await res.json()) as TokenPair;
}
