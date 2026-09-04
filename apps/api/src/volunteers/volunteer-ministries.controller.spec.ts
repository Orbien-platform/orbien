import { Reflector } from '@nestjs/core';
import { VolunteerMinistriesController } from './volunteer-ministries.controller';
import { VolunteerMinistriesService } from './volunteer-ministries.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['secretary'],
  plan: 'premium',
};

const WRITE_ROLES = ['admin_congregation', 'tenant_admin', 'secretary'];

function rolesFor(methodName: keyof VolunteerMinistriesController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(
    ROLES_KEY,
    VolunteerMinistriesController.prototype[methodName],
  );
}

describe('VolunteerMinistriesController', () => {
  let service: jest.Mocked<VolunteerMinistriesService>;
  let controller: VolunteerMinistriesController;

  beforeEach(() => {
    service = {
      assignToMinistry: jest.fn(),
      updateAssignment: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<VolunteerMinistriesService>;

    controller = new VolunteerMinistriesController(service);
  });

  it('assignToMinistry exige papel de escrita', () => {
    expect(rolesFor('assignToMinistry')).toEqual(WRITE_ROLES);
  });

  it('update exige papel de escrita', () => {
    expect(rolesFor('update')).toEqual(WRITE_ROLES);
  });

  it('remove exige papel de escrita', () => {
    expect(rolesFor('remove')).toEqual(WRITE_ROLES);
  });

  it('assignToMinistry delega ao service', async () => {
    service.assignToMinistry.mockResolvedValue({ id: 'vm1' } as never);

    const result = await controller.assignToMinistry(
      { ministry_id: 'm1', volunteer_profile_id: 'p1' } as never,
      USER,
    );

    expect(service.assignToMinistry).toHaveBeenCalledWith('t1', 'g1', {
      ministry_id: 'm1',
      volunteer_profile_id: 'p1',
    });
    expect(result).toEqual({ id: 'vm1' });
  });

  it('update delega ao service', async () => {
    service.updateAssignment.mockResolvedValue({ id: 'vm1' } as never);

    const result = await controller.update('vm1', { role: 'leader' } as never, USER);

    expect(service.updateAssignment).toHaveBeenCalledWith('t1', 'g1', 'vm1', { role: 'leader' });
    expect(result).toEqual({ id: 'vm1' });
  });

  it('remove delega ao service', async () => {
    service.remove.mockResolvedValue({ id: 'vm1' } as never);

    const result = await controller.remove('vm1', USER);

    expect(service.remove).toHaveBeenCalledWith('t1', 'g1', 'vm1');
    expect(result).toEqual({ id: 'vm1' });
  });
});
