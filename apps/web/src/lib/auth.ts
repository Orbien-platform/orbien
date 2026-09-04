const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_EMAIL_KEY = "user_email";
// Marcadores da sessão de suporte, gravados por /suporte/sessao. Servem para a
// UI dizer, sem ambiguidade, que quem está logado é o suporte da plataforma
// dentro de outra igreja. Não são credencial e não abrem nada: o que autoriza é
// o `support_session: true` dentro do JWT assinado.
const SUPPORT_SESSION_KEY = "support_session";
const SUPPORT_TENANT_KEY = "support_session_tenant";

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
  localStorage.removeItem(SUPPORT_SESSION_KEY);
  localStorage.removeItem(SUPPORT_TENANT_KEY);
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
  /** Sessão de suporte da plataforma. Satisfaz qualquer @Roles no RolesGuard. */
  support_session?: boolean;
  impersonated_by?: string;
}

export function isSupportSession(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(SUPPORT_SESSION_KEY) !== "1") return false;
  // O marcador é conveniência; a fonte é o token. Se os dois discordarem —
  // marcador esquecido de uma sessão anterior, por exemplo — vale o token.
  const token = getAccessToken();
  return token ? decodeJwtPayload(token)?.support_session === true : false;
}

export function getSupportTenantName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SUPPORT_TENANT_KEY);
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
