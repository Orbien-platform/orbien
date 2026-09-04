import { Reflector } from '@nestjs/core';
import { VolunteerProfilesController } from './volunteer-profiles.controller';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['secretary'],
  plan: 'premium',
};

function rolesFor(methodName: keyof VolunteerProfilesController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, VolunteerProfilesController.prototype[methodName]);
}

describe('VolunteerProfilesController', () => {
  let service: jest.Mocked<VolunteerProfilesService>;
  let controller: VolunteerProfilesController;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<VolunteerProfilesService>;

    controller = new VolunteerProfilesController(service);
  });

  it('create exige papel de escrita', () => {
    expect(rolesFor('create')).toEqual(['admin_congregation', 'tenant_admin', 'secretary']);
  });

  it('findAll aceita papéis de leitura, incluindo ministry_leader', () => {
    expect(rolesFor('findAll')).toEqual([
      'admin_congregation',
      'pastor',
      'tenant_admin',
      'secretary',
      'ministry_leader',
    ]);
  });

  it('remove exige papel administrativo, mais restrito que update', () => {
    expect(rolesFor('remove')).toEqual(['admin_congregation', 'tenant_admin']);
    expect(rolesFor('update')).toEqual(['admin_congregation', 'tenant_admin', 'secretary']);
  });

  it('create delega ao service', async () => {
    service.create.mockResolvedValue({ id: 'profile-1' } as never);

    const result = await controller.create({ person_id: 'p1' } as never, USER);

    expect(service.create).toHaveBeenCalledWith('t1', 'g1', { person_id: 'p1' });
    expect(result).toEqual({ id: 'profile-1' });
  });

  it('findAll delega ao service', async () => {
    service.findAll.mockResolvedValue([]);

    const result = await controller.findAll(USER);

    expect(service.findAll).toHaveBeenCalledWith('t1', 'g1');
    expect(result).toEqual([]);
  });

  it('findOne delega ao service', async () => {
    service.findOne.mockResolvedValue({ id: 'profile-1' } as never);

    const result = await controller.findOne('profile-1', USER);

    expect(service.findOne).toHaveBeenCalledWith('t1', 'g1', 'profile-1');
    expect(result).toEqual({ id: 'profile-1' });
  });

  it('update delega ao service', async () => {
    service.update.mockResolvedValue({ id: 'profile-1' } as never);

    const result = await controller.update('profile-1', { restrictions: 'x' } as never, USER);

    expect(service.update).toHaveBeenCalledWith('t1', 'g1', 'profile-1', { restrictions: 'x' });
    expect(result).toEqual({ id: 'profile-1' });
  });

  it('remove delega ao service', async () => {
    service.remove.mockResolvedValue({ id: 'profile-1' } as never);

    const result = await controller.remove('profile-1', USER);

    expect(service.remove).toHaveBeenCalledWith('t1', 'g1', 'profile-1');
    expect(result).toEqual({ id: 'profile-1' });
  });
});
