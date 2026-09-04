/**
 * Sessão do console de plataforma.
 *
 * Mora no `localStorage` de `admin.<domínio>`, que é uma origem própria: a
 * sessão daqui e a do `apps/web` não se veem, não se sobrescrevem e expiram
 * separado. É por isso que a sessão de suporte precisa ser entregue ao web
 * por URL (ver `openSupportSession`) — não existe storage compartilhado para
 * passá-la por baixo.
 */

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_EMAIL_KEY = "user_email";

export function saveTokens(
  accessToken: string,
  refreshToken: string,
  email?: string
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  if (email) localStorage.setItem(USER_EMAIL_KEY, email);
  // Cookie para o proxy (SSR). Expira junto com o refresh token (7 dias).
  document.cookie = `auth_session=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUserEmail(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(USER_EMAIL_KEY);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_EMAIL_KEY);
  document.cookie = "auth_session=; path=/; max-age=0";
}

export interface JwtPayload {
  sub: string;
  tenant_id: string;
  congregation_id: string;
  roles: string[];
  plan: string;
  iat: number;
  exp: number;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  return payload.exp * 1000 < Date.now();
}

/**
 * O papel que dá acesso a este console. Vem do token, e o token é assinado —
 * mas isto aqui é só a porta da UI: o que de fato barra é o `RolesGuard` na
 * API e o `app_platform_access()` no banco, que resolve o papel por
 * `role_assignments` e não pelo JWT. Checar aqui serve para não deixar um
 * tenant_admin entrar e ver quatro telas que respondem 403.
 */
export const PLATFORM_ROLE = "platform_support";

export function hasPlatformRole(token: string): boolean {
  return decodeJwtPayload(token)?.roles.includes(PLATFORM_ROLE) ?? false;
}
