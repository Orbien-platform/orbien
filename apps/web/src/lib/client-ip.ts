/**
 * IP do cliente para a API (PEND-04, rate limit por IP).
 *
 * As chamadas do servidor do web à API (login, refresh, logout e o
 * `/api-proxy`) saem da Vercel; sem isto a API vê o IP de saída dela e todos os
 * usuários do web dividem os mesmos baldes de rate limit. A API só confia nos
 * cabeçalhos abaixo quando `x-orbien-proxy-auth` bate com `ORBIEN_PROXY_SECRET`
 * (`apps/api/src/common/middleware/proxy-client-ip.ts`).
 *
 * Na Vercel `x-real-ip` e o primeiro item de `x-forwarded-for` são escritos
 * pela borda, não pelo browser. Sem `ORBIEN_PROXY_SECRET` nada é enviado e o
 * comportamento é o de antes.
 */

export const PROXY_AUTH_HEADER = "x-orbien-proxy-auth";
export const CLIENT_IP_HEADER = "x-orbien-client-ip";

export function clientIpHeaders(request: Request): Record<string, string> {
  const secret = process.env.ORBIEN_PROXY_SECRET;
  if (!secret) return {};

  const ip =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return {};

  return { [PROXY_AUTH_HEADER]: secret, [CLIENT_IP_HEADER]: ip };
}
