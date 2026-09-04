import { Reflector } from '@nestjs/core';
import { GroupTypesController } from './group-types.controller';
import { GroupTypesService } from './group-types.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['tenant_admin'],
  plan: 'premium',
};

function rolesFor(methodName: keyof GroupTypesController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, GroupTypesController.prototype[methodName]);
}

describe('GroupTypesController', () => {
  let service: jest.Mocked<GroupTypesService>;
  let controller: GroupTypesController;

  beforeEach(() => {
    service = {
      findAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deactivate: jest.fn(),
    } as unknown as jest.Mocked<GroupTypesService>;

    controller = new GroupTypesController(service);
  });

  it('findAll não tem @Roles — qualquer usuário autenticado pode listar', () => {
    expect(rolesFor('findAll')).toBeUndefined();
  });

  it('create e update exigem admin', () => {
    expect(rolesFor('create')).toEqual(['tenant_admin', 'admin_congregation']);
    expect(rolesFor('update')).toEqual(['tenant_admin', 'admin_congregation']);
  });

  it('deactivate exige tenant_admin', () => {
    expect(rolesFor('deactivate')).toEqual(['tenant_admin']);
  });

  it('findAll delega ao service com include_inactive convertido em boolean', async () => {
    service.findAll.mockResolvedValue([]);

    const result = await controller.findAll(USER, 'true');

    expect(service.findAll).toHaveBeenCalledWith('t1', 'g1', true);
    expect(result).toEqual([]);
  });

  it('findAll trata include_inactive ausente como false', async () => {
    service.findAll.mockResolvedValue([]);

    await controller.findAll(USER, undefined);

    expect(service.findAll).toHaveBeenCalledWith('t1', 'g1', false);
  });

  it('create delega ao service', async () => {
    service.create.mockResolvedValue({ id: 'gt1' } as never);

    const result = await controller.create({ name: 'Célula' } as never, USER);

    expect(service.create).toHaveBeenCalledWith('t1', 'g1', { name: 'Célula' });
    expect(result).toEqual({ id: 'gt1' });
  });

  it('update delega ao service', async () => {
    service.update.mockResolvedValue({ id: 'gt1' } as never);

    const result = await controller.update('gt1', { name: 'Novo' } as never, USER);

    expect(service.update).toHaveBeenCalledWith('t1', 'g1', 'gt1', { name: 'Novo' });
    expect(result).toEqual({ id: 'gt1' });
  });

  it('deactivate delega ao service', async () => {
    service.deactivate.mockResolvedValue({ id: 'gt1', is_active: false } as never);

    const result = await controller.deactivate('gt1', USER);

    expect(service.deactivate).toHaveBeenCalledWith('t1', 'g1', 'gt1');
    expect(result).toEqual({ id: 'gt1', is_active: false });
  });
});
