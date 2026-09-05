import { Reflector } from '@nestjs/core';
import { CelebrationsController } from './celebrations.controller';
import { CelebrationsService } from './celebrations.service';
import { CelebrationInstancesService } from './celebration-instances.service';
import { CelebrationScheduleService } from './celebration-schedule.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const MANAGE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];
const READ_ROLES = [...MANAGE_ROLES, 'secretary', 'ministry_leader'];
const MATERIALIZE_ROLES = ['admin_congregation', 'tenant_admin', 'pastor', 'ministry_leader'];
const SCHEDULE_MATERIALIZE_ROLES = ['admin_congregation', 'tenant_admin', 'pastor', 'ministry_leader'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function rolesFor(methodName: keyof CelebrationsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, CelebrationsController.prototype[methodName]);
}

describe('CelebrationsController', () => {
  let celebrationsService: jest.Mocked<CelebrationsService>;
  let instancesService: jest.Mocked<CelebrationInstancesService>;
  let scheduleService: jest.Mocked<CelebrationScheduleService>;
  let controller: CelebrationsController;

  beforeEach(() => {
    celebrationsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CelebrationsService>;

    instancesService = {
      materializeInstancesForPeriod: jest.fn(),
    } as unknown as jest.Mocked<CelebrationInstancesService>;

    scheduleService = {
      materializePeriodWithStatus: jest.fn(),
    } as unknown as jest.Mocked<CelebrationScheduleService>;

    controller = new CelebrationsController(celebrationsService, instancesService, scheduleService);
  });

  it('create delega ao service e exige papel de gestão', async () => {
    celebrationsService.create.mockResolvedValue({ id: 'c1' } as never);

    const result = await controller.create({ name: 'Culto' } as never, user);

    expect(celebrationsService.create).toHaveBeenCalledWith('tenant-1', 'cong-1', { name: 'Culto' });
    expect(result).toEqual({ id: 'c1' });
    expect(rolesFor('create')).toEqual(MANAGE_ROLES);
  });

  it('findAll delega ao service com a query e exige papel de leitura', async () => {
    celebrationsService.findAll.mockResolvedValue([{ id: 'c1' }] as never);

    const result = await controller.findAll({ is_active: true } as never, user);

    expect(celebrationsService.findAll).toHaveBeenCalledWith('tenant-1', { is_active: true });
    expect(result).toEqual([{ id: 'c1' }]);
    expect(rolesFor('findAll')).toEqual(READ_ROLES);
  });

  it('findOne delega ao service e exige papel de leitura', async () => {
    celebrationsService.findOne.mockResolvedValue({ id: 'c1' } as never);

    const result = await controller.findOne('c1', user);

    expect(celebrationsService.findOne).toHaveBeenCalledWith('tenant-1', 'cong-1', 'c1');
    expect(result).toEqual({ id: 'c1' });
    expect(rolesFor('findOne')).toEqual(READ_ROLES);
  });

  it('update delega ao service e exige papel de gestão', async () => {
    celebrationsService.update.mockResolvedValue({ id: 'c1' } as never);

    const result = await controller.update('c1', { name: 'Novo' } as never, user);

    expect(celebrationsService.update).toHaveBeenCalledWith('tenant-1', 'cong-1', 'c1', {
      name: 'Novo',
    });
    expect(result).toEqual({ id: 'c1' });
    expect(rolesFor('update')).toEqual(MANAGE_ROLES);
  });

  it('remove delega ao service e exige papel restrito a admins', async () => {
    celebrationsService.remove.mockResolvedValue({ id: 'c1' } as never);

    const result = await controller.remove('c1', user);

    expect(celebrationsService.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 'c1');
    expect(result).toEqual({ id: 'c1' });
    expect(rolesFor('remove')).toEqual(['admin_congregation', 'tenant_admin']);
  });

  it('materializeInstances converte from/to em Date e delega ao instancesService', async () => {
    instancesService.materializeInstancesForPeriod.mockResolvedValue([] as never);

    await controller.materializeInstances('c1', { from: '2026-09-01', to: '2026-09-30' }, user);

    expect(instancesService.materializeInstancesForPeriod).toHaveBeenCalledWith(
      'tenant-1',
      'cong-1',
      'c1',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );
    expect(rolesFor('materializeInstances')).toEqual(MATERIALIZE_ROLES);
  });

  it('materializeSchedulePeriod converte from/to em Date e delega ao scheduleService', async () => {
    scheduleService.materializePeriodWithStatus.mockResolvedValue([] as never);

    await controller.materializeSchedulePeriod('c1', { from: '2026-09-01', to: '2026-09-30' }, user);

    expect(scheduleService.materializePeriodWithStatus).toHaveBeenCalledWith(
      'tenant-1',
      'cong-1',
      'c1',
      new Date('2026-09-01'),
      new Date('2026-09-30'),
    );
    expect(rolesFor('materializeSchedulePeriod')).toEqual(SCHEDULE_MATERIALIZE_ROLES);
  });
});
