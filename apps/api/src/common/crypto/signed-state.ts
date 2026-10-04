import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const TTL_MS = 10 * 60 * 1000;

/**
 * O `state` do OAuth com a Cloudflare é o único jeito de o callback (rota
 * pública, sem Authorization header — o navegador do tenant chega lá vindo
 * do redirect da Cloudflare, não de uma chamada autenticada da API) saber
 * QUAL tenant iniciou a conexão. Em vez de guardar isso numa tabela, o
 * `state` carrega o próprio `tenant_id` assinado por HMAC-SHA256 — o
 * mesmo princípio de token curto e auto-contido do resto da base (ver
 * `POST /auth/impersonate` em `CLAUDE.md`), só que aqui não precisa nem de
 * `sub`/papel, porque quem mintou o state já passou por
 * `JwtAuthGuard`+`RolesGuard`+`PlanGuard` no endpoint que gera a URL de
 * autorização.
 *
 * Formato: `<payload base64url>.<assinatura base64url>`. Expira em 10
 * minutos — tempo de sobra para o tenant completar o fluxo na Cloudflare,
 * curto o bastante para não valer a pena guardar/reusar um state vazado.
 */
@Injectable()
export class SignedState {
  private get secret(): string {
    return process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'] ?? '';
  }

  sign(tenantId: string): string {
    const payload = JSON.stringify({
      tenant_id: tenantId,
      nonce: randomBytes(8).toString('hex'),
      exp: Date.now() + TTL_MS,
    });
    const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
    return `${payloadB64}.${signature}`;
  }

  verify(state: string): { tenantId: string } {
    const [payloadB64, signature] = state.split('.');
    if (!payloadB64 || !signature) {
      throw new UnauthorizedException('state inválido');
    }

    const expected = createHmac('sha256', this.secret).update(payloadB64).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('state inválido');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      tenant_id: string;
      exp: number;
    };
    if (Date.now() > payload.exp) {
      throw new UnauthorizedException('state expirado — reinicie a conexão com a Cloudflare');
    }

    return { tenantId: payload.tenant_id };
  }
}
