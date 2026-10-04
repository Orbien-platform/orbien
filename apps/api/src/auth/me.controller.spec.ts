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
    expect(controller.permissions(payload({ roles: ['treasurer'] })).areas).toEqual([
      'persons',
      'small_groups',
      'financial',
    ]);
  });

  it('conta sem papel nenhum recebe lista vazia, não erro', () => {
    // Quem não enxerga nada também precisa da resposta: é o que faz a barra
    // lateral não desenhar link nenhum, em vez de desenhar todos.
    expect(controller.permissions(payload({ roles: [] })).areas).toEqual([]);
  });

  it('sessão de suporte recebe todas as áreas quando o tenant impersonado é Premium', () => {
    const result = controller.permissions(
      payload({ roles: ['platform_support'], support_session: true, plan: 'premium' }),
    );

    expect(result.areas).toEqual(PRODUCT_AREAS);
  });

  it('mesmo em sessão de suporte, tenant Starter não abre as áreas Premium', () => {
    const result = controller.permissions(
      payload({ roles: ['platform_support'], support_session: true, plan: 'starter' }),
    );

    // `celebrations` e `audit` (PROD-21) — ver `PREMIUM_ONLY_AREAS`.
    expect(result.areas).toEqual(
      PRODUCT_AREAS.filter((area) => area !== 'celebrations' && area !== 'audit'),
    );
  });

  it('`platform_support` sem sessão de suporte não enxerga área nenhuma', () => {
    // O papel sozinho não abre dado de igreja — abrir é papel da impersonação,
    // que marca o token com `support_session`.
    expect(controller.permissions(payload({ roles: ['platform_support'] })).areas).toEqual([]);
  });

  describe('features.asaas_payments (trava de pagamentos pela Asaas)', () => {
    const original = process.env['ASAAS_PAYMENTS_ENABLED'];
    afterEach(() => {
      if (original === undefined) delete process.env['ASAAS_PAYMENTS_ENABLED'];
      else process.env['ASAAS_PAYMENTS_ENABLED'] = original;
    });

    it('sem a variável, vem desligada — inclusive para tenant Premium', () => {
      delete process.env['ASAAS_PAYMENTS_ENABLED'];
      expect(
        controller.permissions(payload({ roles: ['tenant_admin'], plan: 'premium' })).features,
      ).toEqual({ asaas_payments: false });
    });

    it('só o literal `true` liga; outro valor qualquer continua desligado', () => {
      process.env['ASAAS_PAYMENTS_ENABLED'] = '1';
      expect(controller.permissions(payload({})).features.asaas_payments).toBe(false);

      process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';
      expect(controller.permissions(payload({})).features.asaas_payments).toBe(true);
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
