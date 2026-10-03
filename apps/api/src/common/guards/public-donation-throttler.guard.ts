import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Limite da doação pública por **igreja + origem**, não só por origem.
 *
 * O `ThrottlerGuard` padrão agrupa por `req.ip`. Atrás do `apps/web` o IP que a
 * API vê pode ser o de saída do proxy (o `/api-proxy` repassa os cabeçalhos, e
 * com `trust proxy 1` a API confia só no último salto — a borda da Render): se
 * for, todos os doadores de todas as igrejas dividiriam um único balde de 10
 * por minuto, e uma manhã de domingo viraria 429. Incluir o slug no balde
 * separa as igrejas entre si; o que protege cada uma contra abuso é o teto de
 * cobranças pendentes por tenant, que vive no banco (`PixService`).
 *
 * Hipótese a validar em staging, não verificada: qual IP chega em `req.ip`
 * quando a requisição vem pelo `apps/web` na Vercel.
 */
@Injectable()
export class PublicDonationThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req['body'] as { tenant_slug?: unknown } | undefined;
    const params = req['params'] as { tenant_slug?: unknown } | undefined;
    const slug = body?.tenant_slug ?? params?.tenant_slug;
    const igreja = typeof slug === 'string' && slug.length > 0 ? slug.slice(0, 64) : 'sem-slug';

    return Promise.resolve(`${igreja}:${String(req['ip'])}`);
  }
}
