import { Reflector } from '@nestjs/core';
import { DemographicsController } from './demographics.controller';
import { DemographicsService } from './demographics.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const DASHBOARD_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'treasurer'];

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['pastor'],
  plan: 'premium',
};

describe('DemographicsController', () => {
  it('getStats delega ao service com usuário e query, e exige papel de dashboard', async () => {
    const demographicsService = {
      getStats: jest.fn().mockResolvedValue({ totals: { visitor: 1, attendee: 0, member: 0, total: 1 } }),
    } as unknown as jest.Mocked<DemographicsService>;
    const controller = new DemographicsController(demographicsService);

    const result = await controller.getStats(user, { since: '2026-01-01' } as never);

    expect(demographicsService.getStats).toHaveBeenCalledWith(user, { since: '2026-01-01' });
    expect(result).toEqual({ totals: { visitor: 1, attendee: 0, member: 0, total: 1 } });

    const reflector = new Reflector();
    expect(
      reflector.get<string[]>(ROLES_KEY, DemographicsController.prototype.getStats),
    ).toEqual(DASHBOARD_ROLES);
  });
});
