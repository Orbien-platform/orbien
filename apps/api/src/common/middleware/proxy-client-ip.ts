import { timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import type { NextFunction, Request, Response } from 'express';

export const PROXY_AUTH_HEADER = 'x-orbien-proxy-auth';
export const CLIENT_IP_HEADER = 'x-orbien-client-ip';

/**
 * IP do cliente quando a requisição vem do servidor do `apps/web` (PEND-04).
 *
 * O login, o refresh e o logout do web saem do servidor da Vercel, e o
 * `/api-proxy` também: a API enxerga o IP de saída da Vercel, igual para todo
 * mundo, e os baldes de rate limit por IP (login 20/15 min, redefinição 10/h,
 * doação por igreja, visitante) viram um balde só para todo o web.
 *
 * `trust proxy 2` NÃO resolve: mobile e admin chamam a API direto, e um
 * `X-Forwarded-For` forjado por eles viraria o IP. Em vez disso o web manda o
 * IP num cabeçalho próprio junto com um segredo compartilhado
 * (`ORBIEN_PROXY_SECRET`, nas duas pontas). Só com o segredo conferindo, em
 * tempo constante, e um IP válido, `req.ip` é sobrescrito — o que cobre de uma
 * vez `ThrottlerGuard`, `PublicDonationThrottlerGuard`, o limitador de visitante
 * e o `audit_logs.ip`. Sem segredo configurado, sem cabeçalho ou com cabeçalho
 * errado, nada muda: `req.ip` segue sendo o de `trust proxy 1`.
 */
export function proxyClientIp(secret: string | undefined) {
  const esperado = secret ? Buffer.from(secret) : null;

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (esperado) {
      const auth = req.headers[PROXY_AUTH_HEADER];
      const ip = req.headers[CLIENT_IP_HEADER];
      if (typeof auth === 'string' && typeof ip === 'string' && isIP(ip) !== 0) {
        const recebido = Buffer.from(auth);
        if (recebido.length === esperado.length && timingSafeEqual(recebido, esperado)) {
          Object.defineProperty(req, 'ip', { value: ip, configurable: true, enumerable: true });
        }
      }
    }
    // Os dois cabeçalhos nunca seguem adiante: nada abaixo deve lê-los.
    delete req.headers[PROXY_AUTH_HEADER];
    delete req.headers[CLIENT_IP_HEADER];
    next();
  };
}
