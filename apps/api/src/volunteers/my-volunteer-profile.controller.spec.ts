import { Reflector } from '@nestjs/core';
import { MyVolunteerProfileController } from './my-volunteer-profile.controller';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('MyVolunteerProfileController', () => {
  it('lê o perfil da conta do token, para qualquer papel que serve', async () => {
    const service = {
      findMine: jest.fn().mockResolvedValue({ id: 'vp1' }),
    } as unknown as jest.Mocked<VolunteerProfilesService>;
    const controller = new MyVolunteerProfileController(service);
    const user: JwtPayload = {
      sub: 'u1',
      tenant_id: 't1',
      congregation_id: 'g1',
      roles: ['member'],
      plan: 'starter',
    };

    await expect(controller.findMine(user)).resolves.toEqual({ id: 'vp1' });
    expect(service.findMine).toHaveBeenCalledWith('u1', 't1', 'g1');
    expect(
      new Reflector().get<string[]>(ROLES_KEY, MyVolunteerProfileController.prototype.findMine),
    ).toEqual(['volunteer', 'member', 'ministry_leader', 'pastor', 'admin_congregation', 'tenant_admin']);
  });

  it('PATCH e POST do termo usam a conta do token e os mesmos papéis', async () => {
    const service = {
      updateMine: jest.fn().mockResolvedValue({ id: 'vp1' }),
      acceptTerm: jest.fn().mockResolvedValue({ id: 'vp1' }),
    } as unknown as jest.Mocked<VolunteerProfilesService>;
    const controller = new MyVolunteerProfileController(service);
    const user: JwtPayload = { sub: 'u1', tenant_id: 't1', congregation_id: 'g1', roles: ['volunteer'], plan: 'starter' };
    const dto = { availability: { monday: ['evening' as const] } };

    await controller.updateMine(dto, user);
    expect(service.updateMine).toHaveBeenCalledWith(user, dto);

    const req = { ip: '1.1.1.1', get: () => 'ua' } as never;
    await controller.acceptTerm({ term_version: 'volunteer_term_v1' }, user, req);
    expect(service.acceptTerm).toHaveBeenCalledWith(user, 'volunteer_term_v1', { ip: '1.1.1.1', userAgent: 'ua' });
    await controller.acceptTerm({ term_version: 'volunteer_term_v1' }, user, { get: () => undefined } as never);
    expect(service.acceptTerm).toHaveBeenLastCalledWith(user, 'volunteer_term_v1', { ip: null, userAgent: null });

    const roles = ['volunteer', 'member', 'ministry_leader', 'pastor', 'admin_congregation', 'tenant_admin'];
    for (const fn of [controller.updateMine, controller.acceptTerm]) {
      expect(new Reflector().get<string[]>(ROLES_KEY, fn)).toEqual(roles);
    }
  });
});
