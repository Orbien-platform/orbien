import { Reflector } from '@nestjs/core';
import { SetlistsController } from './setlists.controller';
import { SetlistsService } from './setlists.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const EDIT_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'];
const DELETE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['ministry_leader'],
  plan: 'starter',
};

function rolesFor(methodName: keyof SetlistsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, SetlistsController.prototype[methodName]);
}

describe('SetlistsController', () => {
  let setlistsService: jest.Mocked<SetlistsService>;
  let controller: SetlistsController;

  beforeEach(() => {
    setlistsService = {
      create: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<SetlistsService>;

    controller = new SetlistsController(setlistsService);
  });

  it('create delega ao service e exige papel de edição', async () => {
    setlistsService.create.mockResolvedValue({ id: 'sl1' } as never);

    const result = await controller.create({ service_order_item_id: 'item1' } as never, user);

    expect(setlistsService.create).toHaveBeenCalledWith('tenant-1', 'cong-1', {
      service_order_item_id: 'item1',
    });
    expect(result).toEqual({ id: 'sl1' });
    expect(rolesFor('create')).toEqual(EDIT_ROLES);
  });

  it('findOne delega ao service e exige papel de edição', async () => {
    setlistsService.findOne.mockResolvedValue({ id: 'sl1' } as never);

    const result = await controller.findOne('sl1', user);

    expect(setlistsService.findOne).toHaveBeenCalledWith('tenant-1', 'cong-1', 'sl1');
    expect(result).toEqual({ id: 'sl1' });
    expect(rolesFor('findOne')).toEqual(EDIT_ROLES);
  });

  it('remove delega ao service e exige papel restrito', async () => {
    setlistsService.remove.mockResolvedValue({ id: 'sl1' } as never);

    const result = await controller.remove('sl1', user);

    expect(setlistsService.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 'sl1');
    expect(result).toEqual({ id: 'sl1' });
    expect(rolesFor('remove')).toEqual(DELETE_ROLES);
  });
});
