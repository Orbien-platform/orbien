import { Reflector } from '@nestjs/core';
import { SmallGroupsController } from './small-groups.controller';
import { SmallGroupsService } from './small-groups.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['secretary'],
  plan: 'premium',
};

const READ_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'treasurer', 'cell_leader'];
const WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];
const MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor'];
const ALERT_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'cell_leader'];

function rolesFor(methodName: keyof SmallGroupsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, SmallGroupsController.prototype[methodName]);
}

describe('SmallGroupsController', () => {
  let service: jest.Mocked<SmallGroupsService>;
  let controller: SmallGroupsController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      getHierarchy: jest.fn(),
      checkAbsenceAlerts: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      addMember: jest.fn(),
      removeMember: jest.fn(),
    } as unknown as jest.Mocked<SmallGroupsService>;

    controller = new SmallGroupsController(service);
  });

  it('create e addMember exigem papel de escrita', () => {
    expect(rolesFor('create')).toEqual(WRITE_ROLES);
    expect(rolesFor('addMember')).toEqual(WRITE_ROLES);
  });

  it('findAll, getHierarchy e findOne aceitam papéis de leitura', () => {
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
    expect(rolesFor('getHierarchy')).toEqual(READ_ROLES);
    expect(rolesFor('findOne')).toEqual(READ_ROLES);
  });

  it('update e removeMember exigem papel de gestão', () => {
    expect(rolesFor('update')).toEqual(MANAGE_ROLES);
    expect(rolesFor('removeMember')).toEqual(MANAGE_ROLES);
  });

  it('remove restringe a tenant_admin/admin_congregation, mais estrito que os demais', () => {
    expect(rolesFor('remove')).toEqual(['tenant_admin', 'admin_congregation']);
  });

  it('checkAbsenceAlerts aceita cell_leader além dos papéis de gestão', () => {
    expect(rolesFor('checkAbsenceAlerts')).toEqual(ALERT_ROLES);
  });

  it('create delega ao service', async () => {
    service.create.mockResolvedValue({ id: 'sg1' } as never);

    const result = await controller.create({ name: 'Célula' } as never, USER);

    expect(service.create).toHaveBeenCalledWith({ name: 'Célula' }, USER);
    expect(result).toEqual({ id: 'sg1' });
  });

  it('findAll delega ao service', async () => {
    service.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    const result = await controller.findAll({ page: 1, limit: 20 } as never);

    expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('getHierarchy delega ao service', async () => {
    service.getHierarchy.mockResolvedValue(null);

    const result = await controller.getHierarchy('sg1');

    expect(service.getHierarchy).toHaveBeenCalledWith('sg1');
    expect(result).toBeNull();
  });

  it('checkAbsenceAlerts delega ao service', async () => {
    service.checkAbsenceAlerts.mockResolvedValue([]);

    const result = await controller.checkAbsenceAlerts('sg1');

    expect(service.checkAbsenceAlerts).toHaveBeenCalledWith('sg1');
    expect(result).toEqual([]);
  });

  it('findOne delega ao service', async () => {
    service.findOne.mockResolvedValue({ id: 'sg1' } as never);

    const result = await controller.findOne('sg1');

    expect(service.findOne).toHaveBeenCalledWith('sg1');
    expect(result).toEqual({ id: 'sg1' });
  });

  it('update delega ao service', async () => {
    service.update.mockResolvedValue({ id: 'sg1' } as never);

    const result = await controller.update('sg1', { name: 'Novo' } as never, USER);

    expect(service.update).toHaveBeenCalledWith('sg1', { name: 'Novo' }, USER);
    expect(result).toEqual({ id: 'sg1' });
  });

  it('remove delega ao service', async () => {
    service.remove.mockResolvedValue({ id: 'sg1' } as never);

    const result = await controller.remove('sg1');

    expect(service.remove).toHaveBeenCalledWith('sg1');
    expect(result).toEqual({ id: 'sg1' });
  });

  it('addMember delega ao service', async () => {
    service.addMember.mockResolvedValue({ id: 'mem1' } as never);

    const result = await controller.addMember('sg1', { person_id: 'p1' } as never, USER);

    expect(service.addMember).toHaveBeenCalledWith('sg1', { person_id: 'p1' }, USER);
    expect(result).toEqual({ id: 'mem1' });
  });

  it('removeMember delega ao service', async () => {
    service.removeMember.mockResolvedValue({ id: 'mem1' } as never);

    const result = await controller.removeMember('sg1', 'p1');

    expect(service.removeMember).toHaveBeenCalledWith('sg1', 'p1');
    expect(result).toEqual({ id: 'mem1' });
  });
});
