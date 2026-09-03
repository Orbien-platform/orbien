/**
 * O que este arquivo prende é uma decisão de segurança, não uma função.
 *
 * `support_session` satisfaz qualquer `@Roles`. É uma exceção larga de
 * propósito — sem ela a impersonação não leva a nada — e por isso os limites
 * dela precisam estar afirmados: só vale com a marca vinda de um token
 * assinado, e não muda nada para quem não a tem.
 */

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

function contextWith(user: Partial<JwtPayload> | undefined): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardRequiring(required: string[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: () => required } as unknown as Reflector;
  return new RolesGuard(reflector);
}

const suporte: Partial<JwtPayload> = {
  sub: 'support-user',
  roles: ['platform_support'],
  support_session: true,
  impersonated_by: 'support-user',
};

describe('RolesGuard', () => {
  describe('sem sessão de suporte', () => {
    it('libera quando a rota não exige papel', () => {
      expect(guardRequiring(undefined).canActivate(contextWith({ roles: [] }))).toBe(true);
      expect(guardRequiring([]).canActivate(contextWith({ roles: [] }))).toBe(true);
    });

    it('libera quando o usuário tem um dos papéis exigidos', () => {
      const guard = guardRequiring(['tenant_admin', 'treasurer']);
      expect(guard.canActivate(contextWith({ roles: ['treasurer'] }))).toBe(true);
    });

    it('barra quando o usuário não tem nenhum dos papéis exigidos', () => {
      const guard = guardRequiring(['tenant_admin', 'treasurer']);
      expect(guard.canActivate(contextWith({ roles: ['member'] }))).toBe(false);
    });

    it('barra `platform_support` nas rotas de dados de igreja', () => {
      // Este é o comportamento que produz os 403 do dashboard para a conta de
      // suporte, e ele continua valendo: a exceção é da sessão, não do papel.
      const guard = guardRequiring(['tenant_admin', 'admin_congregation', 'pastor', 'secretary']);
      expect(guard.canActivate(contextWith({ roles: ['platform_support'] }))).toBe(false);
    });
  });

  describe('com sessão de suporte', () => {
    it('libera rota cujo papel o usuário não tem', () => {
      const guard = guardRequiring(['tenant_admin', 'admin_congregation']);
      expect(guard.canActivate(contextWith(suporte))).toBe(true);
    });

    it('libera também rota de escrita', () => {
      const guard = guardRequiring(['tenant_admin']);
      expect(guard.canActivate(contextWith(suporte))).toBe(true);
    });

    it('exige o booleano verdadeiro — valor ausente ou falso não libera', () => {
      const guard = guardRequiring(['tenant_admin']);
      expect(guard.canActivate(contextWith({ roles: ['platform_support'] }))).toBe(false);
      expect(
        guard.canActivate(contextWith({ roles: ['platform_support'], support_session: false })),
      ).toBe(false);
    });

    it('não libera valor apenas truthy vindo de um payload adulterado', () => {
      // A comparação é `=== true`, não coerção. Um token com
      // `support_session: "1"` — que só existiria se alguém tivesse a chave de
      // assinatura — não passa por descuido de tipo.
      const guard = guardRequiring(['tenant_admin']);
      const adulterado = { roles: [], support_session: '1' } as unknown as Partial<JwtPayload>;
      expect(guard.canActivate(contextWith(adulterado))).toBe(false);
    });
  });
});
