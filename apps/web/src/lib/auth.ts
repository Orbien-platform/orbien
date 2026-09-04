/**
 * Leitura do JWT — e só isso.
 *
 * Este arquivo já guardou os tokens em `localStorage`. Não guarda mais: a
 * sessão vive em cookie `HttpOnly` (ver `src/lib/session.ts`), fora do alcance
 * do JavaScript da página. O que sobrou aqui é decodificação de payload, que
 * não é segredo — o JWT é assinado, não cifrado — e roda dos dois lados.
 *
 * Decodificar **não** é validar. Quem valida assinatura é a API. O uso legítimo
 * destas funções é exibição e desempate de fluxo (a faixa de suporte, o
 * `exp` do handoff antes de gastar uma ida ao servidor).
 */

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
