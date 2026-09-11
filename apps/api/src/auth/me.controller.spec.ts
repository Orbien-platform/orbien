import { Reflector } from '@nestjs/core';
import { MeController } from './me.controller';
import { ROLES_KEY } from './decorators/roles.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PRODUCT_AREAS } from './product-areas';

function payload(overrides: Partial<JwtPayload>): JwtPayload {
  return {
    sub: 'user-1',
    tenant_id: 'tenant-1',
    congregation_id: 'cong-1',
    roles: [],
    plan: 'starter',
    ...overrides,
  };
}

describe('MeController', () => {
  const controller = new MeController();

  it('responde as áreas do papel de quem pergunta', () => {
    expect(controller.permissions(payload({ roles: ['treasurer'] }))).toEqual({
      areas: ['persons', 'small_groups', 'financial'],
    });
  });

  it('conta sem papel nenhum recebe lista vazia, não erro', () => {
    // Quem não enxerga nada também precisa da resposta: é o que faz a barra
    // lateral não desenhar link nenhum, em vez de desenhar todos.
    expect(controller.permissions(payload({ roles: [] }))).toEqual({ areas: [] });
  });

  it('sessão de suporte recebe todas as áreas', () => {
    const result = controller.permissions(
      payload({ roles: ['platform_support'], support_session: true }),
    );

    expect(result.areas).toEqual(PRODUCT_AREAS);
  });

  it('`platform_support` sem sessão de suporte não enxerga área nenhuma', () => {
    // O papel sozinho não abre dado de igreja — abrir é papel da impersonação,
    // que marca o token com `support_session`.
    expect(controller.permissions(payload({ roles: ['platform_support'] }))).toEqual({
      areas: [],
    });
  });

  it('não exige papel: a rota responde sobre o próprio token', () => {
    const roles = new Reflector().get<string[] | undefined>(
      ROLES_KEY,
      MeController.prototype.permissions,
    );

    expect(roles).toBeUndefined();
  });
});
