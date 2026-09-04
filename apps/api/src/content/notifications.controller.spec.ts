import { Reflector } from '@nestjs/core';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['admin_congregation'],
  plan: 'premium',
};

const ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

function rolesFor(methodName: keyof NotificationsController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, NotificationsController.prototype[methodName]);
}

describe('NotificationsController', () => {
  let service: jest.Mocked<NotificationsService>;
  let controller: NotificationsController;

  beforeEach(() => {
    service = {
      sendManualNotification: jest.fn(),
      getMetrics: jest.fn(),
    } as unknown as jest.Mocked<NotificationsService>;

    controller = new NotificationsController(service);
  });

  it('send e metrics exigem os mesmos papéis administrativos', () => {
    expect(rolesFor('send')).toEqual(ROLES);
    expect(rolesFor('metrics')).toEqual(ROLES);
  });

  it('send delega ao service e retorna ok', async () => {
    service.sendManualNotification.mockResolvedValue(undefined);

    const result = await controller.send({ title: 'T', body: 'B', segment_ids: [] } as never, USER);

    expect(service.sendManualNotification).toHaveBeenCalledWith('t1', 'g1', {
      title: 'T',
      body: 'B',
      segment_ids: [],
    });
    expect(result).toEqual({ ok: true });
  });

  it('metrics delega ao service', async () => {
    service.getMetrics.mockResolvedValue({ id: 'd1' } as never);

    const result = await controller.metrics('d1', USER);

    expect(service.getMetrics).toHaveBeenCalledWith('t1', 'g1', 'd1');
    expect(result).toEqual({ id: 'd1' });
  });
});
