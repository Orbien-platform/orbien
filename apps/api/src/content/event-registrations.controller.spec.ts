import { Reflector } from '@nestjs/core';
import { EventRegistrationsController } from './event-registrations.controller';
import { EventRegistrationsService } from './event-registrations.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../auth/decorators/requires-plan.decorator';
import { PRODUCT_AREA_READ_ROLES } from '../auth/product-areas';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const ORGANIZER_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

function rolesFor(method: keyof EventRegistrationsController): string[] | undefined {
  return new Reflector().get<string[] | undefined>(
    ROLES_KEY,
    EventRegistrationsController.prototype[method],
  );
}

function user(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-1',
    tenant_id: 't1',
    congregation_id: 'g1',
    roles: ['member'],
    plan: 'starter',
    ...overrides,
  };
}

describe('EventRegistrationsController', () => {
  let service: jest.Mocked<EventRegistrationsService>;
  let controller: EventRegistrationsController;

  beforeEach(() => {
    service = {
      list: jest.fn(),
      summary: jest.fn(),
      findMine: jest.fn(),
      registerSelf: jest.fn(),
      register: jest.fn(),
      cancelMine: jest.fn(),
      cancel: jest.fn(),
    } as unknown as jest.Mocked<EventRegistrationsService>;
    controller = new EventRegistrationsController(service);
  });

  describe('quem alcança o quê', () => {
    it('a lista de inscritos é do organizador', () => {
      expect(rolesFor('list')).toEqual(ORGANIZER_ROLES);
    });

    it('inscrever outra pessoa e cancelar a inscrição alheia também', () => {
      expect(rolesFor('register')).toEqual(ORGANIZER_ROLES);
      expect(rolesFor('cancel')).toEqual(ORGANIZER_ROLES);
    });

    it('as rotas `/me` e o resumo valem para quem lê conteúdo, `member` incluído', () => {
      const leitura = [...PRODUCT_AREA_READ_ROLES.content];

      expect(leitura).toContain('member');
      for (const method of ['summary', 'findMine', 'registerSelf', 'cancelMine'] as const) {
        expect(rolesFor(method)).toEqual(leitura);
      }
    });
  });

  // O recorte Premium do PROD-16 é o evento COM pagamento, que esta entrega
  // não tem. Evento gratuito é Starter — um `@RequiresPlan` aqui cobraria
  // Premium por algo que a matriz de preço dá aos dois planos.
  it('não é rota Premium', () => {
    expect(new Reflector().get(REQUIRES_PLAN_KEY, EventRegistrationsController)).toBeUndefined();
  });

  it('a inscrição do próprio usuário não aceita corpo — nome e pessoa vêm do token', () => {
    controller.registerSelf('p1', user());

    expect(service.registerSelf).toHaveBeenCalledWith('t1', 'g1', 'p1', 'user-1');
  });

  it('o organizador passa o corpo, e fica registrado como quem inscreveu', () => {
    const dto = { full_name: 'João', email: 'joao@ex.com' };

    controller.register('p1', dto, user({ sub: 'org-1', roles: ['pastor'] }));

    expect(service.register).toHaveBeenCalledWith('t1', 'g1', 'p1', dto, 'org-1');
  });

  it('tenant e congregação vêm do token, nunca da rota', () => {
    controller.list('p1', {}, user({ tenant_id: 't-do-token', congregation_id: 'g-do-token' }));

    expect(service.list).toHaveBeenCalledWith('t-do-token', 'g-do-token', 'p1', {});
  });

  it('o resumo não devolve nomes — só vagas e prazo', () => {
    controller.summary('p1', user());

    expect(service.summary).toHaveBeenCalledWith('t1', 'g1', 'p1');
  });

  it('`/me` pergunta pela inscrição do próprio usuário, pelo `sub` do token', () => {
    controller.findMine('p1', user({ sub: 'membro-1' }));

    expect(service.findMine).toHaveBeenCalledWith('t1', 'g1', 'p1', 'membro-1');
  });

  it('cancelar a própria inscrição não precisa do id dela', () => {
    controller.cancelMine('p1', user());

    expect(service.cancelMine).toHaveBeenCalledWith('t1', 'g1', 'p1', 'user-1');
  });

  it('o organizador cancela pelo id da inscrição', () => {
    controller.cancel('p1', 'r1', user({ roles: ['tenant_admin'] }));

    expect(service.cancel).toHaveBeenCalledWith('t1', 'g1', 'p1', 'r1');
  });
});
