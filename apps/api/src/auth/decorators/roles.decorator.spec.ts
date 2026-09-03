import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Roles } from './roles.decorator';

describe('Roles', () => {
  it('grava a lista de papéis em ROLES_KEY, lida pelo Reflector', () => {
    class Controller {
      @Roles('tenant_admin', 'treasurer')
      handler() {}
    }

    const reflector = new Reflector();
    const metadata = reflector.get(ROLES_KEY, new Controller().handler);
    expect(metadata).toEqual(['tenant_admin', 'treasurer']);
  });

  it('sem papel nenhum grava lista vazia', () => {
    class Controller {
      @Roles()
      handler() {}
    }

    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, new Controller().handler)).toEqual([]);
  });
});
