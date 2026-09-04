import { Reflector } from '@nestjs/core';
import { ServiceOrderItemsController } from './service-order-items.controller';
import { ServiceOrderItemsService } from './service-order-items.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const MANAGER_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['pastor'],
  plan: 'starter',
};

function rolesFor(methodName: keyof ServiceOrderItemsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    ServiceOrderItemsController.prototype[methodName],
  );
}

describe('ServiceOrderItemsController', () => {
  let itemsService: jest.Mocked<ServiceOrderItemsService>;
  let controller: ServiceOrderItemsController;

  beforeEach(() => {
    itemsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      reorder: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderItemsService>;

    controller = new ServiceOrderItemsController(itemsService);
  });

  it('create delega ao service e amplia papéis com ministry_leader', async () => {
    itemsService.create.mockResolvedValue({ id: 'item1' } as never);

    const result = await controller.create({ name: 'Item' } as never, user);

    expect(itemsService.create).toHaveBeenCalledWith('tenant-1', 'cong-1', { name: 'Item' });
    expect(result).toEqual({ id: 'item1' });
    expect(rolesFor('create')).toEqual([...MANAGER_ROLES, 'ministry_leader']);
  });

  it('findAll delega ao service com o service_order_id da query', async () => {
    itemsService.findAll.mockResolvedValue([{ id: 'item1' }] as never);

    const result = await controller.findAll('so1', user);

    expect(itemsService.findAll).toHaveBeenCalledWith('tenant-1', 'cong-1', 'so1');
    expect(result).toEqual([{ id: 'item1' }]);
    expect(rolesFor('findAll')).toEqual([...MANAGER_ROLES, 'ministry_leader', 'volunteer', 'member']);
  });

  it('findOne delega ao service', async () => {
    itemsService.findOne.mockResolvedValue({ id: 'item1' } as never);

    const result = await controller.findOne('item1', user);

    expect(itemsService.findOne).toHaveBeenCalledWith('tenant-1', 'cong-1', 'item1');
    expect(result).toEqual({ id: 'item1' });
    expect(rolesFor('findOne')).toEqual([...MANAGER_ROLES, 'ministry_leader', 'volunteer', 'member']);
  });

  it('update delega ao service', async () => {
    itemsService.update.mockResolvedValue({ id: 'item1' } as never);

    const result = await controller.update('item1', { name: 'Novo' } as never, user);

    expect(itemsService.update).toHaveBeenCalledWith('tenant-1', 'cong-1', 'item1', { name: 'Novo' });
    expect(result).toEqual({ id: 'item1' });
    expect(rolesFor('update')).toEqual([...MANAGER_ROLES, 'ministry_leader']);
  });

  it('remove delega ao service', async () => {
    itemsService.remove.mockResolvedValue({ id: 'item1' } as never);

    const result = await controller.remove('item1', user);

    expect(itemsService.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 'item1');
    expect(result).toEqual({ id: 'item1' });
    expect(rolesFor('remove')).toEqual([...MANAGER_ROLES, 'ministry_leader']);
  });

  it('reorder delega ao service', async () => {
    itemsService.reorder.mockResolvedValue(undefined);

    const result = await controller.reorder({ items: [] } as never, user);

    expect(itemsService.reorder).toHaveBeenCalledWith('tenant-1', 'cong-1', { items: [] });
    expect(result).toBeUndefined();
    expect(rolesFor('reorder')).toEqual([...MANAGER_ROLES, 'ministry_leader']);
  });
});
