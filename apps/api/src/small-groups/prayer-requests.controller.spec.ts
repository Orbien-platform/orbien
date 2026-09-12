import { Reflector } from '@nestjs/core';
import { PrayerRequestsController } from './prayer-requests.controller';
import { PrayerRequestsService } from './prayer-requests.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['member'],
  plan: 'starter',
};

const PRAYER_ROLES = [
  'member',
  'cell_leader',
  'secretary',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

function rolesFor(methodName: keyof PrayerRequestsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    PrayerRequestsController.prototype[methodName],
  );
}

describe('PrayerRequestsController', () => {
  let service: jest.Mocked<PrayerRequestsService>;
  let controller: PrayerRequestsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findByGroup: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<PrayerRequestsService>;

    controller = new PrayerRequestsController(service);
  });

  it('as três rotas exigem papel autenticado, e o mesmo conjunto', () => {
    expect(rolesFor('create')).toEqual(PRAYER_ROLES);
    expect(rolesFor('findByGroup')).toEqual(PRAYER_ROLES);
    expect(rolesFor('remove')).toEqual(PRAYER_ROLES);
  });

  it('não expõe a lista a `volunteer` nem a `treasurer` — papel de célula é outro', () => {
    expect(rolesFor('findByGroup')).not.toContain('volunteer');
    expect(rolesFor('findByGroup')).not.toContain('treasurer');
  });

  it('repassa grupo, corpo e usuário para o service ao criar', async () => {
    await controller.create('sg1', { content: 'orem por mim' }, USER);
    expect(service.create).toHaveBeenCalledWith('sg1', { content: 'orem por mim' }, USER);
  });

  it('repassa grupo e usuário ao listar — o service é quem confere participação', async () => {
    await controller.findByGroup('sg1', USER);
    expect(service.findByGroup).toHaveBeenCalledWith('sg1', USER);
  });

  it('repassa grupo, pedido e usuário ao remover', async () => {
    await controller.remove('sg1', 'pr1', USER);
    expect(service.remove).toHaveBeenCalledWith('sg1', 'pr1', USER);
  });
});
