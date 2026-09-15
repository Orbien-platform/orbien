import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { isIP } from 'net';

export const PROXY_SECRET_HEADER = 'x-orbien-proxy-secret';
export const CLIENT_IP_HEADER = 'x-orbien-client-ip';

type RequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

function headerValue(req: RequestLike, name: string): string | undefined {
  const raw = req.headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

// Comparação de tamanho fixo: `timingSafeEqual` estoura se os buffers têm
// comprimentos diferentes, e o próprio comprimento já seria um vazamento. O
// teste de tamanho vem antes e devolve false sem comparar.
function secretMatches(sent: string, expected: string): boolean {
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * ThrottlerGuard que enxerga o visitante, e não o proxy.
 *
 * O PROBLEMA: em produção o browser não fala com esta API. Ele fala com
 * `/api-proxy`, um Route Handler do `apps/web` na Vercel, que refaz a chamada
 * para o Render — é esse desenho que mantém o access token só do lado do
 * servidor (ver o cabeçalho de `api-proxy/[...path]/route.ts`). O efeito
 * colateral é que, para o Express, TODA requisição pública chega da mesma
 * origem: a borda da Render sobrescreve o `X-Forwarded-For` com o IP de quem
 * conectou, que é a função da Vercel. Com `trust proxy: 1`, `req.ip` vira esse
 * endereço, igual para o planeta inteiro.
 *
 * O limite por IP então deixa de isolar qualquer coisa: ele vira uma cota
 * global. Nas rotas de conteúdo isso derruba visitante legítimo (o
 * "quero visitar" de PROD-13 é 5/h); nas rotas de credencial é pior, porque
 * `POST /auth/login` e `POST /auth/platform/login` dependem desse recorte
 * justamente para conter varredura — ver o comentário de
 * `LoginRateLimitService`, que é por e-mail e não cobre origem.
 *
 * A SOLUÇÃO, e por que ela não é "ler o X-Forwarded-For": esta API é
 * alcançável direto, sem passar pela Vercel. Confiar num cabeçalho que
 * qualquer cliente escreve transformaria o limite por IP em decoração — bastaria
 * sortear um valor novo a cada tentativa para nunca esbarrar nele, inclusive no
 * login. O cabeçalho só vale, portanto, quando vem acompanhado de um segredo
 * que só o proxy conhece (`ORBIEN_PROXY_SECRET`, o mesmo valor nas duas
 * pontas). Sem segredo configurado, sem segredo conferindo, ou sem IP válido no
 * cabeçalho, o guard cai em `req.ip` — que é exatamente o comportamento de
 * hoje, e o lado seguro do erro: no pior caso o limite volta a ser global, nunca
 * inexistente.
 *
 * Quem preenche o `x-orbien-client-ip` é o Route Handler, a partir do que a
 * Vercel diz do visitante; o handler também barra os dois cabeçalhos vindos do
 * browser, para que ninguém os injete de fora.
 */
@Injectable()
export class ProxyClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: RequestLike): Promise<string> {
    const fallback = req.ip ?? '';

    const expected = process.env['ORBIEN_PROXY_SECRET'];
    if (!expected) return fallback;

    const sent = headerValue(req, PROXY_SECRET_HEADER);
    if (!sent || !secretMatches(sent, expected)) return fallback;

    // `isIP` recusa qualquer coisa que não seja IPv4/IPv6. Sem essa checagem o
    // proxy autenticado poderia, por um bug próprio, alimentar a chave do
    // armazenamento do throttler com texto arbitrário.
    const clientIp = headerValue(req, CLIENT_IP_HEADER);
    if (!clientIp || isIP(clientIp) === 0) return fallback;

    return clientIp;
  }
}
