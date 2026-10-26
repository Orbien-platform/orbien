import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { KidsChildrenController } from './kids-children.controller';
import { KidsGuardiansController } from './kids-guardians.controller';
import { KidsConsentController } from '../consent/kids-consent.controller';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../../auth/decorators/requires-plan.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = { sub: 'u1', tenant_id: 't1', congregation_id: 'g1', roles: ['member'], plan: 'premium' };
const ACTOR = { userId: 'u1', tenantId: 't1', congregationId: 'g1', roles: ['member'] };
const FAMILY = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'ministry_leader', 'member'];
const req = { ip: '1.2.3.4', get: (h: string) => (h === 'user-agent' ? 'ua' : undefined) } as unknown as Request;
const reflector = new Reflector();

describe.each([KidsChildrenController, KidsGuardiansController, KidsConsentController])(
  '%p — pilha de guards',
  (ctrl) => {
    it('exige plano premium e os papéis de gestão ou responsável (nunca volunteer/visitante)', () => {
      expect(reflector.get(REQUIRES_PLAN_KEY, ctrl)).toBe('premium');
      expect(reflector.get<string[]>(ROLES_KEY, ctrl)).toEqual(FAMILY);
      expect(reflector.get<string[]>(ROLES_KEY, ctrl)).not.toContain('volunteer');
    });
  },
);

describe('KidsChildrenController', () => {
  it('delega ao service com o ator do JWT e metadados de IP/UA no cadastro', async () => {
    const service = {
      list: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'c1' }),
      getFicha: jest.fn().mockResolvedValue({ id: 'c1' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
    };
    const controller = new KidsChildrenController(service as never);
    const dto = { full_name: 'Ana', birth_date: new Date() };

    await controller.list({ search: 'a' }, USER);
    await controller.create(dto, USER, req);
    await controller.findOne('c1', USER);
    await controller.update('c1', { full_name: 'B' }, USER);

    expect(service.list).toHaveBeenCalledWith(ACTOR, { search: 'a' });
    expect(service.create).toHaveBeenCalledWith(ACTOR, dto, { ip: '1.2.3.4', userAgent: 'ua' });
    expect(service.getFicha).toHaveBeenCalledWith(ACTOR, 'c1');
    expect(service.update).toHaveBeenCalledWith(ACTOR, 'c1', { full_name: 'B' });
  });
});

describe('KidsGuardiansController', () => {
  it('delega add e remove ao service com o ator do JWT', async () => {
    const service = {
      add: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({}),
    };
    const controller = new KidsGuardiansController(service as never);
    const dto = { full_name: 'Rosa', phone: '1', relationship: 'avó' };

    await controller.add('c1', dto, USER);
    await controller.remove('kg1', USER);
    await controller.update('kg1', { can_pickup: false }, USER);

    expect(service.add).toHaveBeenCalledWith(ACTOR, 'c1', dto);
    expect(service.remove).toHaveBeenCalledWith(ACTOR, 'kg1');
    expect(service.update).toHaveBeenCalledWith(ACTOR, 'kg1', { can_pickup: false });
  });
});

describe('KidsConsentController', () => {
  it('delega status, aceite (com IP/UA) e revogação ao service', async () => {
    const service = {
      status: jest.fn().mockResolvedValue({}),
      register: jest.fn().mockResolvedValue({}),
      revokeFor: jest.fn().mockResolvedValue({ revoked: 1 }),
    };
    const controller = new KidsConsentController(service as never);

    await controller.status({}, USER);
    await controller.register({ term_version: 'v' }, USER, req);
    await controller.revoke({ reason: 'r' }, USER);

    expect(service.status).toHaveBeenCalledWith(ACTOR, undefined);
    expect(service.register).toHaveBeenCalledWith(ACTOR, { term_version: 'v' }, { ip: '1.2.3.4', userAgent: 'ua' });
    expect(service.revokeFor).toHaveBeenCalledWith(ACTOR, { reason: 'r' });
  });
});
