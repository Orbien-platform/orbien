import { Reflector } from '@nestjs/core';
import { CostCentersController } from './cost-centers.controller';
import { CostCentersService } from './cost-centers.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const WRITE_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];
const READ_ROLES = ['admin_congregation', 'pastor', 'secretary', 'treasurer', 'tenant_admin'];
const DELETE_ROLES = ['admin_congregation', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

function rolesFor(methodName: keyof CostCentersController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    CostCentersController.prototype[methodName],
  );
}

describe('CostCentersController', () => {
  let costCentersService: jest.Mocked<CostCentersService>;
  let controller: CostCentersController;

  beforeEach(() => {
    costCentersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CostCentersService>;

    controller = new CostCentersController(costCentersService);
  });

  it('create delega ao service e exige papel de escrita', async () => {
    costCentersService.create.mockResolvedValue({ id: 'cc1' } as never);

    const result = await controller.create({ name: 'X' } as never, user);

    expect(costCentersService.create).toHaveBeenCalledWith({ name: 'X' }, user);
    expect(result).toEqual({ id: 'cc1' });
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
  });

  it('findAll delega ao service e exige papel de leitura', async () => {
    costCentersService.findAll.mockResolvedValue([{ id: 'cc1' }] as never);

    const result = await controller.findAll(user);

    expect(costCentersService.findAll).toHaveBeenCalledWith(user);
    expect(result).toEqual([{ id: 'cc1' }]);
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
  });

  it('update delega ao service e exige papel de escrita', async () => {
    costCentersService.update.mockResolvedValue({ id: 'cc1' } as never);

    const result = await controller.update('cc1', { name: 'Y' } as never, user);

    expect(costCentersService.update).toHaveBeenCalledWith('cc1', { name: 'Y' }, user);
    expect(result).toEqual({ id: 'cc1' });
    expect(rolesFor('update')).toEqual(WRITE_ROLES);
  });

  it('remove delega ao service e exige papel restrito', async () => {
    costCentersService.remove.mockResolvedValue({ id: 'cc1' } as never);

    const result = await controller.remove('cc1', user);

    expect(costCentersService.remove).toHaveBeenCalledWith('cc1', user);
    expect(result).toEqual({ id: 'cc1' });
    expect(rolesFor('remove')).toEqual(DELETE_ROLES);
  });
});
