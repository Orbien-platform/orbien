import { CelebrationAttendanceController } from './celebration-attendance.controller';
import { CelebrationAttendanceService } from './celebration-attendance.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

describe('CelebrationAttendanceController', () => {
  const user = { sub: 'u1', tenant_id: 't1', congregation_id: 'g1', roles: ['pastor'] } as JwtPayload;
  const service = {
    save: jest.fn().mockResolvedValue('saved'),
    summary: jest.fn().mockResolvedValue('summary'),
    list: jest.fn().mockResolvedValue('list'),
  };
  const controller = new CelebrationAttendanceController(service as unknown as CelebrationAttendanceService);

  it('save delega ao service com id, usuário e corpo', async () => {
    const dto = { children: 1, members: 2, attendees: 3, visitors: 4 };
    await expect(controller.save('i1', dto, user)).resolves.toBe('saved');
    expect(service.save).toHaveBeenCalledWith('i1', user, dto);
  });

  it('summary e list delegam com o filtro', async () => {
    await expect(controller.summary({ celebration_id: 'c1' }, user)).resolves.toBe('summary');
    await expect(controller.list({}, user)).resolves.toBe('list');
    expect(service.summary).toHaveBeenCalledWith(user, { celebration_id: 'c1' });
    expect(service.list).toHaveBeenCalledWith(user, {});
  });
});
