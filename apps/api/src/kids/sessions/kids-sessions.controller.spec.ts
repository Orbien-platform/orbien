import { Reflector } from '@nestjs/core';
import { KidsSessionsController } from './kids-sessions.controller';
import { KidsSessionsService } from './kids-sessions.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['pastor'],
  plan: 'premium',
};
const MANAGE = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'ministry_leader'];

const rolesFor = (m: keyof KidsSessionsController) =>
  new Reflector().get<string[] | undefined>(ROLES_KEY, KidsSessionsController.prototype[m]);

describe('KidsSessionsController', () => {
  let service: jest.Mocked<KidsSessionsService>;
  let controller: KidsSessionsController;

  beforeEach(() => {
    service = {
      listByInstance: jest.fn().mockResolvedValue([]),
      open: jest.fn().mockResolvedValue([]),
      cancel: jest.fn().mockResolvedValue({ id: 's1' }),
    } as unknown as jest.Mocked<KidsSessionsService>;
    controller = new KidsSessionsController(service);
  });

  it('abrir e cancelar exigem papel de gestão; listar também aceita volunteer', () => {
    expect(rolesFor('open')).toEqual(MANAGE);
    expect(rolesFor('cancel')).toEqual(MANAGE);
    expect(rolesFor('list')).toEqual([...MANAGE, 'volunteer']);
  });

  it('delega ao service com tenant/congregação do usuário', async () => {
    await controller.list('i1', USER);
    await controller.open('i1', { room_ids: ['r1', 'r2'] }, USER);
    await controller.cancel('s1', USER);

    expect(service.listByInstance).toHaveBeenCalledWith('t1', 'g1', 'i1');
    expect(service.open).toHaveBeenCalledWith('t1', 'g1', 'i1', ['r1', 'r2']);
    expect(service.cancel).toHaveBeenCalledWith('t1', 'g1', 's1');
  });
});
