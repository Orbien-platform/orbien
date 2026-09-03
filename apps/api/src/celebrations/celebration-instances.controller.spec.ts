import { Reflector } from '@nestjs/core';
import { CelebrationInstancesController } from './celebration-instances.controller';
import { CelebrationInstancesService } from './celebration-instances.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const WRITE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary'];
const READ_ROLES = [...WRITE_ROLES, 'ministry_leader'];
const DELETE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function rolesFor(methodName: keyof CelebrationInstancesController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    CelebrationInstancesController.prototype[methodName],
  );
}

describe('CelebrationInstancesController', () => {
  let instancesService: jest.Mocked<CelebrationInstancesService>;
  let controller: CelebrationInstancesController;

  beforeEach(() => {
    instancesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CelebrationInstancesService>;

    controller = new CelebrationInstancesController(instancesService);
  });

  it('create delega ao service e exige papel de escrita', async () => {
    instancesService.create.mockResolvedValue({ id: 'i1' } as never);

    const result = await controller.create({ celebration_id: 'c1' } as never, user);

    expect(instancesService.create).toHaveBeenCalledWith('tenant-1', 'cong-1', { celebration_id: 'c1' });
    expect(result).toEqual({ id: 'i1' });
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
  });

  it('findAll delega ao service com a query e exige papel de leitura', async () => {
    instancesService.findAll.mockResolvedValue([{ id: 'i1' }] as never);

    const result = await controller.findAll({ status: 'draft' } as never, user);

    expect(instancesService.findAll).toHaveBeenCalledWith('tenant-1', 'cong-1', { status: 'draft' });
    expect(result).toEqual([{ id: 'i1' }]);
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
  });

  it('findOne delega ao service e exige papel de leitura', async () => {
    instancesService.findOne.mockResolvedValue({ id: 'i1' } as never);

    const result = await controller.findOne('i1', user);

    expect(instancesService.findOne).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1');
    expect(result).toEqual({ id: 'i1' });
    expect(rolesFor('findOne')).toEqual(READ_ROLES);
  });

  it('update delega ao service e exige papel de escrita', async () => {
    instancesService.update.mockResolvedValue({ id: 'i1' } as never);

    const result = await controller.update('i1', { notes: 'x' } as never, user);

    expect(instancesService.update).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1', { notes: 'x' });
    expect(result).toEqual({ id: 'i1' });
    expect(rolesFor('update')).toEqual(WRITE_ROLES);
  });

  it('remove delega ao service e exige papel restrito', async () => {
    instancesService.remove.mockResolvedValue({ id: 'i1' } as never);

    const result = await controller.remove('i1', user);

    expect(instancesService.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1');
    expect(result).toEqual({ id: 'i1' });
    expect(rolesFor('remove')).toEqual(DELETE_ROLES);
  });
});
