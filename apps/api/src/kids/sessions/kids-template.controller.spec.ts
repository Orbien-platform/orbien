import { Reflector } from '@nestjs/core';
import { KidsTemplateController } from './kids-template.controller';
import { KidsTemplateService } from './kids-template.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = { sub: 'u1', tenant_id: 't1', congregation_id: 'g1', roles: ['pastor'], plan: 'premium' };
const MANAGE = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'ministry_leader'];
const rolesFor = (m: keyof KidsTemplateController) =>
  new Reflector().get<string[] | undefined>(ROLES_KEY, KidsTemplateController.prototype[m]);

describe('KidsTemplateController', () => {
  let service: jest.Mocked<KidsTemplateService>;
  let controller: KidsTemplateController;

  beforeEach(() => {
    service = {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue({}),
      apply: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<KidsTemplateService>;
    controller = new KidsTemplateController(service);
  });

  it('definir e aplicar exigem gestão; ler aceita volunteer', () => {
    expect(rolesFor('set')).toEqual(MANAGE);
    expect(rolesFor('apply')).toEqual(MANAGE);
    expect(rolesFor('get')).toEqual([...MANAGE, 'volunteer']);
  });

  it('delega ao service com tenant/congregação do usuário', async () => {
    await controller.get('c1', USER);
    await controller.set('c1', { room_ids: ['r1'] }, USER);
    await controller.apply('c1', { date_to: '2026-12-31' }, USER);

    expect(service.get).toHaveBeenCalledWith('t1', 'g1', 'c1');
    expect(service.set).toHaveBeenCalledWith('t1', 'g1', 'c1', ['r1']);
    expect(service.apply).toHaveBeenCalledWith('t1', 'g1', 'c1', { date_to: '2026-12-31' });
  });
});
