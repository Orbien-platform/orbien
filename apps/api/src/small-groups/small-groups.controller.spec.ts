import { Reflector } from '@nestjs/core';
import { SmallGroupsController } from './small-groups.controller';
import { SmallGroupsService } from './small-groups.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../auth/decorators/requires-plan.decorator';
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
const MINE_ROLES = [
  'member',
  'cell_leader',
  'treasurer',
  'secretary',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

function rolesFor(methodName: keyof SmallGroupsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, SmallGroupsController.prototype[methodName]);
}

function requiredPlanFor(methodName: keyof SmallGroupsController): string | undefined {
  const reflector = new Reflector();
  return reflector.get<string | undefined>(
    REQUIRES_PLAN_KEY,
    SmallGroupsController.prototype[methodName],
  );
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
      findMine: jest.fn(),
      listVisitRequests: jest.fn(),
      multiply: jest.fn(),
      getHealth: jest.fn(),
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

  it('listVisitRequests aceita cell_leader — quem responde ao pedido é a liderança da célula', () => {
    expect(rolesFor('listVisitRequests')).toEqual(ALERT_ROLES);
  });

  it('multiply aceita cell_leader — escopo real é checado no service (PROD-20)', () => {
    expect(rolesFor('multiply')).toEqual(ALERT_ROLES);
  });

  it('multiply delega ao service com id, dto e usuário', async () => {
    service.multiply.mockResolvedValue({ id: 'child-1' } as never);

    const result = await controller.multiply(
      'sg1',
      { name: 'Filha', leader_person_id: 'p2', member_ids: ['p1'] } as never,
      USER,
    );

    expect(service.multiply).toHaveBeenCalledWith(
      'sg1',
      { name: 'Filha', leader_person_id: 'p2', member_ids: ['p1'] },
      USER,
    );
    expect(result).toEqual({ id: 'child-1' });
  });

  it('getHealth aceita papéis de leitura e exige plano Premium (CEL20-04)', () => {
    expect(rolesFor('getHealth')).toEqual(READ_ROLES);
    expect(requiredPlanFor('getHealth')).toBe('premium');
  });

  it('getHealth delega ao service', async () => {
    service.getHealth.mockResolvedValue({
      status: 'green',
      last_meeting_at: null,
      days_since_last_meeting: null,
    });

    const result = await controller.getHealth('sg1');

    expect(service.getHealth).toHaveBeenCalledWith('sg1');
    expect(result).toEqual({ status: 'green', last_meeting_at: null, days_since_last_meeting: null });
  });

  it('listVisitRequests delega ao service', async () => {
    service.listVisitRequests.mockResolvedValue([]);

    const result = await controller.listVisitRequests('sg1');

    expect(service.listVisitRequests).toHaveBeenCalledWith('sg1');
    expect(result).toEqual([]);
  });

  it('findMine aceita member (MOB-09-09) — autoescopado pelo próprio usuário', () => {
    expect(rolesFor('findMine')).toEqual(MINE_ROLES);
  });

  it('findMine delega ao service com sub/tenant_id/congregation_id do usuário', async () => {
    service.findMine.mockResolvedValue([]);

    const result = await controller.findMine(USER);

    expect(service.findMine).toHaveBeenCalledWith('u1', 't1', 'g1');
    expect(result).toEqual([]);
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
    service.getHierarchy.mockResolvedValue({ ancestors: [], tree: null });

    const result = await controller.getHierarchy('sg1');

    expect(service.getHierarchy).toHaveBeenCalledWith('sg1');
    expect(result).toEqual({ ancestors: [], tree: null });
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
