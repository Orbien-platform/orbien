// decodeJwtPayload (MOB-07) — leitura do payload de um JWT, sem validar
// assinatura. Decodificar não é validar: quem valida é a API. Uso legítimo
// é config/exibição local, nunca decisão de negócio — mesmo princípio e
// mesmo algoritmo de apps/web/src/lib/auth.ts, aqui usado para montar as
// tags do OneSignal (design.md, Rodada 4).
//
// `atob` é global nativo do Hermes (motor JS do RN) desde que passou a ser
// builtin do motor — sem polyfill/lib nova (design.md, Pesquisa da Rodada 4).

export interface MobileJwtPayload {
  sub: string;
  tenant_id: string;
  congregation_id: string;
  roles: string[];
  exp: number;
}

export function decodeJwtPayload(token: string): MobileJwtPayload | null {
  try {
    const base64Url = token.split(".")[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as MobileJwtPayload;
  } catch {
    return null;
  }
}
