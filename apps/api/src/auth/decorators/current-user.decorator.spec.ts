import { ExecutionContext } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentUser } from './current-user.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * `createParamDecorator` não expõe a factory diretamente — ela fica presa
 * nos metadados de argumentos da rota. Este é o jeito padrão do Nest de
 * extrair a factory para testar sem montar um `ExecutionContext` de verdade
 * na chamada.
 */
function getFactory(): (data: unknown, ctx: ExecutionContext) => JwtPayload {
  class TestController {
    handler(@CurrentUser() _user: JwtPayload) {}
  }

  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestController, 'handler');
  const key = Object.keys(metadata)[0];
  return metadata[key].factory;
}

describe('CurrentUser', () => {
  it('extrai o user anexado à requisição pelo JwtAuthGuard', () => {
    const user: JwtPayload = {
      sub: 'u1',
      tenant_id: 't1',
      congregation_id: 'c1',
      roles: ['tenant_admin'],
      plan: 'starter',
    };

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(getFactory()(undefined, ctx)).toBe(user);
  });
});
