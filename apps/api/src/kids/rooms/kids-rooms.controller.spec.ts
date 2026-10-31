import { Reflector } from '@nestjs/core';
import { KidsRoomsController } from './kids-rooms.controller';
import { KidsRoomsService } from './kids-rooms.service';
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

const rolesFor = (m: keyof KidsRoomsController) =>
  new Reflector().get<string[] | undefined>(ROLES_KEY, KidsRoomsController.prototype[m]);

describe('KidsRoomsController', () => {
  let service: jest.Mocked<KidsRoomsService>;
  let controller: KidsRoomsController;

  beforeEach(() => {
    service = {
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn().mockResolvedValue({ id: 'r1' }),
      deactivate: jest.fn().mockResolvedValue({ id: 'r1' }),
    } as unknown as jest.Mocked<KidsRoomsService>;
    controller = new KidsRoomsController(service);
  });

  it.each(['create', 'update', 'deactivate'] as const)('%s exige papel de gestão', (m) => {
    expect(rolesFor(m)).toEqual(MANAGE);
  });

  it.each(['findAll', 'findOne'] as const)('%s também aceita volunteer', (m) => {
    expect(rolesFor(m)).toEqual([...MANAGE, 'volunteer']);
  });

  it('delega ao service com tenant/congregação do usuário, nunca do corpo', async () => {
    const dto = { name: 'M', min_age_months: 0, max_age_months: 11 };
    await controller.create(dto, USER);
    await controller.findAll({ include_inactive: true }, USER);
    await controller.findOne('r1', USER);
    await controller.update('r1', { name: 'N' }, USER);
    await controller.deactivate('r1', USER);

    expect(service.create).toHaveBeenCalledWith('t1', 'g1', dto);
    expect(service.findAll).toHaveBeenCalledWith('t1', 'g1', { include_inactive: true });
    expect(service.findOne).toHaveBeenCalledWith('t1', 'g1', 'r1');
    expect(service.update).toHaveBeenCalledWith('t1', 'g1', 'r1', { name: 'N' });
    expect(service.deactivate).toHaveBeenCalledWith('t1', 'g1', 'r1');
  });
});
