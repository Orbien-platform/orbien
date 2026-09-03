/**
 * O que este arquivo prende são as duas exceções que o produto abre para o
 * suporte da plataforma e o rastro que as compensa:
 *
 *   - sessão de suporte satisfaz qualquer `@Roles` → `support_access`;
 *   - rota de plataforma opera fora de qualquer tenant → `platform_access`.
 *
 * Requisição que não é nenhuma das duas não pode gerar linha nenhuma — o
 * interceptor é global, e auditar tudo seria outro produto.
 */

import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const comum: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['tenant_admin'],
  plan: 'premium',
};

const suporte: JwtPayload = {
  ...comum,
  sub: 'support-1',
  roles: ['platform_support'],
  support_session: true,
  impersonated_by: 'support-1',
};

function run(opts: {
  user?: JwtPayload;
  isPlatformRoute?: boolean;
  body?: unknown;
}) {
  const writes: unknown[][] = [];

  const prisma = {
    $executeRaw: (_s: TemplateStringsArray, ...values: unknown[]) => {
      writes.push(values);
      return Promise.resolve(1);
    },
  } as unknown as PrismaService;

  const reflector = {
    getAllAndOverride: () => (opts.isPlatformRoute ? true : undefined),
  } as unknown as Reflector;

  const ctx = {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: opts.user,
        path: '/platform/tenants',
        method: 'POST',
        ip: '10.0.0.1',
        get: () => 'jest',
      }),
      getResponse: () => ({ statusCode: 201 }),
    }),
  } as unknown as ExecutionContext;

  const next: CallHandler = { handle: () => of(opts.body ?? 'resultado') };

  return {
    writes,
    result: firstValueFrom(new AuditInterceptor(prisma, reflector).intercept(ctx, next)),
  };
}

// Posição dos parâmetros na chamada de audit_insert(). Não bate com a ordem
// da assinatura: `p_subject_person_id` e `p_before` são NULL literal no SQL,
// não interpolação, e por isso não entram na lista de valores.
//   0 tenant · 1 congregation · 2 actor · 3 entity · 4 action · 5 after
const ACTION = 4;
const AFTER = 5;

describe('AuditInterceptor', () => {
  it('não registra requisição comum', async () => {
    const { writes, result } = run({ user: comum });
    await result;

    expect(writes).toHaveLength(0);
  });

  it('não registra requisição sem usuário', async () => {
    const { writes, result } = run({});
    await result;

    expect(writes).toHaveLength(0);
  });

  it('registra support_access em sessão de suporte', async () => {
    const { writes, result } = run({ user: suporte });
    await result;

    expect(writes).toHaveLength(1);
    expect(writes[0]?.[ACTION]).toBe('support_access');
  });

  it('registra platform_access em rota de plataforma', async () => {
    const { writes, result } = run({ user: comum, isPlatformRoute: true });
    await result;

    expect(writes).toHaveLength(1);
    expect(writes[0]?.[ACTION]).toBe('platform_access');
  });

  it('guarda qual tenant foi criado, não só a rota', async () => {
    const { writes, result } = run({
      user: comum,
      isPlatformRoute: true,
      body: { tenant_id: 'tenant-novo', slug: 'igreja-nova' },
    });
    await result;

    expect(JSON.parse(String(writes[0]?.[AFTER]))).toEqual({
      route: '/platform/tenants',
      method: 'POST',
      status: 201,
      subject_tenant_id: 'tenant-novo',
    });
  });

  it('resposta sem tenant_id não quebra o registro', async () => {
    const { writes, result } = run({ user: comum, isPlatformRoute: true, body: [1, 2, 3] });
    await result;

    expect(JSON.parse(String(writes[0]?.[AFTER])).subject_tenant_id).toBeNull();
  });

  it('sessão de suporte numa rota de plataforma registra support_access', async () => {
    // As duas marcas juntas: o que interessa é que havia impersonação.
    const { writes, result } = run({ user: suporte, isPlatformRoute: true });
    await result;

    expect(writes[0]?.[ACTION]).toBe('support_access');
  });
});
