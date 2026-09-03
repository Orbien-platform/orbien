/**
 * O que este arquivo prende são duas decisões, não o encanamento:
 *
 *   1. toda requisição autenticada troca para `app_user` antes de qualquer
 *      query — é isso que faz o RLS ser avaliado em produção, e não só na
 *      suíte de testes;
 *   2. rota marcada com `@PlatformRoute()` não fixa tenant — é a ausência de
 *      `app.tenant_id` que habilita o ramo `app_platform_access()` das
 *      policies.
 *
 * Perder qualquer uma das duas falha em silêncio: (1) volta a ler todos os
 * tenants, (2) passa a ler nenhum.
 */

import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

interface Captured {
  raw: string[];
  params: unknown[][];
}

function prismaStub(captured: Captured): PrismaService {
  const tx = {
    $executeRawUnsafe: (sql: string) => {
      captured.raw.push(sql);
      return Promise.resolve(1);
    },
    $executeRaw: (_strings: TemplateStringsArray, ...values: unknown[]) => {
      captured.params.push(values);
      return Promise.resolve(1);
    },
  };

  return {
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    withTx: (_t: unknown, fn: () => Promise<unknown>) => fn(),
  } as unknown as PrismaService;
}

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['tenant_admin'],
  plan: 'premium',
};

function contextWith(u: JwtPayload | undefined): { ctx: ExecutionContext; req: Record<string, unknown> } {
  const req: Record<string, unknown> = { user: u };
  return {
    req,
    ctx: {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext,
  };
}

// `u` não tem default: passar `undefined` explícito num parâmetro com default
// cai no default, e o caso "sem usuário" testaria o oposto do que diz.
function run(isPlatformRoute: boolean, u: JwtPayload | undefined) {
  const captured: Captured = { raw: [], params: [] };
  const reflector = {
    getAllAndOverride: () => (isPlatformRoute ? true : undefined),
  } as unknown as Reflector;

  const interceptor = new TenantContextInterceptor(prismaStub(captured), reflector);
  const { ctx, req } = contextWith(u);
  const next: CallHandler = { handle: () => of('resultado') };

  return { captured, req, result: firstValueFrom(interceptor.intercept(ctx, next)) };
}

describe('TenantContextInterceptor', () => {
  it('não abre transação nem troca de role quando não há usuário', async () => {
    const { captured, result } = run(false, undefined);

    await expect(result).resolves.toBe('resultado');
    expect(captured.raw).toHaveLength(0);
    expect(captured.params).toHaveLength(0);
  });

  it('troca para app_user antes de setar o contexto', async () => {
    const { captured, result } = run(false, user);
    await result;

    expect(captured.raw).toEqual(['SET LOCAL ROLE app_user']);
  });

  it('rota comum fixa tenant e congregação do token', async () => {
    const { captured, req, result } = run(false, user);
    await result;

    expect(captured.params[0]).toEqual(['tenant-1', 'cong-1', 'user-1', 'tenant_admin']);
    expect(req['tenant_id']).toBe('tenant-1');
    expect(req['congregation_id']).toBe('cong-1');
  });

  it('rota de plataforma não fixa tenant nem congregação', async () => {
    const { captured, req, result } = run(true, user);
    await result;

    // String vazia: `app_current_tenant()` faz NULLIF e devolve NULL, que é a
    // condição do ramo de plataforma. O `app.user_id` continua indo — é por
    // ele que a policy resolve o papel.
    expect(captured.params[0]).toEqual(['', '', 'user-1', 'tenant_admin']);
    expect(req['tenant_id']).toBeUndefined();
    expect(req['congregation_id']).toBeUndefined();
  });

  it('rota de plataforma também troca para app_user', async () => {
    const { captured, result } = run(true, user);
    await result;

    expect(captured.raw).toEqual(['SET LOCAL ROLE app_user']);
  });
});
