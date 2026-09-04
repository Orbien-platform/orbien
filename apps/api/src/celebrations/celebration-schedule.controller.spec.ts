import { Reflector } from '@nestjs/core';
import { CelebrationScheduleController } from './celebration-schedule.controller';
import { CelebrationScheduleService } from './celebration-schedule.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const MANAGE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'ministry_leader'];
const DELETE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['ministry_leader'],
  plan: 'starter',
};

function rolesFor(methodName: keyof CelebrationScheduleController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    CelebrationScheduleController.prototype[methodName],
  );
}

describe('CelebrationScheduleController', () => {
  let scheduleService: jest.Mocked<CelebrationScheduleService>;
  let controller: CelebrationScheduleController;

  beforeEach(() => {
    scheduleService = {
      createOrGet: jest.fn(),
      getSchedule: jest.fn(),
      remove: jest.fn(),
      addMinistry: jest.fn(),
      removeMinistry: jest.fn(),
      applyTemplate: jest.fn(),
    } as unknown as jest.Mocked<CelebrationScheduleService>;

    controller = new CelebrationScheduleController(scheduleService);
  });

  it('createOrGet delega ao service e exige papel de gestão', async () => {
    scheduleService.createOrGet.mockResolvedValue({ id: 's1' } as never);

    const result = await controller.createOrGet('i1', user);

    expect(scheduleService.createOrGet).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1');
    expect(result).toEqual({ id: 's1' });
    expect(rolesFor('createOrGet')).toEqual(MANAGE_ROLES);
  });

  it('getSchedule delega ao service e exige papel de gestão', async () => {
    scheduleService.getSchedule.mockResolvedValue({ id: 's1' } as never);

    const result = await controller.getSchedule('i1', user);

    expect(scheduleService.getSchedule).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1');
    expect(result).toEqual({ id: 's1' });
    expect(rolesFor('getSchedule')).toEqual(MANAGE_ROLES);
  });

  it('remove delega ao service e exige papel restrito (sem ministry_leader)', async () => {
    scheduleService.remove.mockResolvedValue({ id: 's1' } as never);

    const result = await controller.remove('i1', user);

    expect(scheduleService.remove).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1');
    expect(result).toEqual({ id: 's1' });
    expect(rolesFor('remove')).toEqual(DELETE_ROLES);
  });

  it('addMinistry delega ao service e exige papel de gestão', async () => {
    scheduleService.addMinistry.mockResolvedValue({ id: 'cm1' } as never);

    const result = await controller.addMinistry('i1', { ministry_id: 'm1', slots: 2 } as never, user);

    expect(scheduleService.addMinistry).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1', {
      ministry_id: 'm1',
      slots: 2,
    });
    expect(result).toEqual({ id: 'cm1' });
    expect(rolesFor('addMinistry')).toEqual(MANAGE_ROLES);
  });

  it('removeMinistry delega ao service e exige papel de gestão', async () => {
    scheduleService.removeMinistry.mockResolvedValue({ id: 'cm1' } as never);

    const result = await controller.removeMinistry('i1', 'm1', user);

    expect(scheduleService.removeMinistry).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1', 'm1');
    expect(result).toEqual({ id: 'cm1' });
    expect(rolesFor('removeMinistry')).toEqual(MANAGE_ROLES);
  });

  it('applyTemplate delega ao service e exige papel de gestão', async () => {
    scheduleService.applyTemplate.mockResolvedValue({ id: 's1' } as never);

    const result = await controller.applyTemplate('i1', { template_id: 'tpl1' } as never, user);

    expect(scheduleService.applyTemplate).toHaveBeenCalledWith('tenant-1', 'cong-1', 'i1', {
      template_id: 'tpl1',
    });
    expect(result).toEqual({ id: 's1' });
    expect(rolesFor('applyTemplate')).toEqual(MANAGE_ROLES);
  });
});
