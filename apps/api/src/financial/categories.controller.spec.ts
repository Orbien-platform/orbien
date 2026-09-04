import { Reflector } from '@nestjs/core';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
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

function rolesFor(methodName: keyof CategoriesController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    CategoriesController.prototype[methodName],
  );
}

describe('CategoriesController', () => {
  let categoriesService: jest.Mocked<CategoriesService>;
  let controller: CategoriesController;

  beforeEach(() => {
    categoriesService = {
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CategoriesService>;

    controller = new CategoriesController(categoriesService);
  });

  it('create delega ao service e exige papel de escrita', async () => {
    categoriesService.create.mockResolvedValue({ id: 'c1' } as never);

    const result = await controller.create({ name: 'X' } as never, user);

    expect(categoriesService.create).toHaveBeenCalledWith({ name: 'X' }, user);
    expect(result).toEqual({ id: 'c1' });
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
  });

  it('findAll delega ao service e exige papel de leitura', async () => {
    categoriesService.findAll.mockResolvedValue([{ id: 'c1' }] as never);

    const result = await controller.findAll(user);

    expect(categoriesService.findAll).toHaveBeenCalledWith(user);
    expect(result).toEqual([{ id: 'c1' }]);
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
  });

  it('update delega ao service e exige papel de escrita', async () => {
    categoriesService.update.mockResolvedValue({ id: 'c1' } as never);

    const result = await controller.update('c1', { name: 'Y' } as never, user);

    expect(categoriesService.update).toHaveBeenCalledWith('c1', { name: 'Y' }, user);
    expect(result).toEqual({ id: 'c1' });
    expect(rolesFor('update')).toEqual(WRITE_ROLES);
  });

  it('remove delega ao service e exige papel restrito', async () => {
    categoriesService.remove.mockResolvedValue({ id: 'c1' } as never);

    const result = await controller.remove('c1', user);

    expect(categoriesService.remove).toHaveBeenCalledWith('c1', user);
    expect(result).toEqual({ id: 'c1' });
    expect(rolesFor('remove')).toEqual(DELETE_ROLES);
  });
});
