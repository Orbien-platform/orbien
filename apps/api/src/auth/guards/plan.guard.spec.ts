import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanGuard } from './plan.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

function contextWith(user: Partial<JwtPayload>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(required: 'premium' | undefined): PlanGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new PlanGuard(reflector);
}

describe('PlanGuard', () => {
  it('libera quando a rota não exige plano nenhum', () => {
    expect(guardRequiring(undefined).canActivate(contextWith({ plan: 'starter' }))).toBe(true);
  });

  it('libera Premium numa rota que exige Premium', () => {
    expect(guardRequiring('premium').canActivate(contextWith({ plan: 'premium' }))).toBe(true);
  });

  it('barra Starter numa rota que exige Premium', () => {
    expect(() => guardRequiring('premium').canActivate(contextWith({ plan: 'starter' }))).toThrow(
      ForbiddenException,
    );
  });

  it('não abre exceção para sessão de suporte — o plano do token já é o do tenant impersonado', () => {
    // Diferente do RolesGuard: `AuthService.impersonate` já escreve no token o
    // plano do tenant ALVO, não o do suporte. Uma sessão de suporte vendo um
    // tenant Starter deve levar o mesmo 403 que o próprio tenant levaria —
    // é o que "ver o que o cliente vê" quer dizer.
    const guard = guardRequiring('premium');
    expect(() =>
      guard.canActivate(contextWith({ plan: 'starter', support_session: true })),
    ).toThrow(ForbiddenException);
  });
});
