import { Reflector } from '@nestjs/core';
import { KidsAttendanceController } from './kids-attendance.controller';
import { KidsAttendanceService } from './kids-attendance.service';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = { sub: 'u1', tenant_id: 't1', congregation_id: 'g1', roles: ['pastor'], plan: 'premium' };

describe('KidsAttendanceController', () => {
  it('summary lê só para a liderança: mesmos papéis de leitura da contagem; member e volunteer ficam de fora', () => {
    const roles = new Reflector().get<string[]>(ROLES_KEY, KidsAttendanceController.prototype.summary);
    expect([...roles].sort()).toEqual(
      ['admin_congregation', 'ministry_leader', 'pastor', 'secretary', 'tenant_admin'].sort(),
    );
    expect(roles).not.toContain('member');
    expect(roles).not.toContain('volunteer');
  });

  it('delega com tenant/congregação do token', async () => {
    const service = { summary: jest.fn().mockResolvedValue({ rooms: [] }) } as unknown as jest.Mocked<KidsAttendanceService>;
    const query = { room_id: 'r1' };

    const out = await new KidsAttendanceController(service).summary(query, USER);

    expect(service.summary).toHaveBeenCalledWith('t1', 'g1', query);
    expect(out).toEqual({ rooms: [] });
  });
});
