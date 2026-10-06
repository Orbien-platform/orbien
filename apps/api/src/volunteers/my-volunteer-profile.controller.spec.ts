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
});
