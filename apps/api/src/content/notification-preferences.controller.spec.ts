import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['member'],
  plan: 'premium',
};

describe('NotificationPreferencesController', () => {
  let service: jest.Mocked<NotificationPreferencesService>;
  let controller: NotificationPreferencesController;

  beforeEach(() => {
    service = {
      get: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<NotificationPreferencesService>;

    controller = new NotificationPreferencesController(service);
  });

  it('get chama service.get(user.sub)', async () => {
    service.get.mockResolvedValue({
      avisos: true,
      oracao: true,
      eventos: true,
      devocional: true,
    });

    const result = await controller.get(USER);

    expect(service.get).toHaveBeenCalledWith('u1');
    expect(result).toEqual({ avisos: true, oracao: true, eventos: true, devocional: true });
  });

  it('update chama service.update(user.sub, user.tenant_id, user.congregation_id, dto)', async () => {
    service.update.mockResolvedValue({
      avisos: true,
      oracao: false,
      eventos: true,
      devocional: true,
    });

    const result = await controller.update({ oracao: false }, USER);

    expect(service.update).toHaveBeenCalledWith('u1', 't1', 'g1', { oracao: false });
    expect(result).toEqual({ avisos: true, oracao: false, eventos: true, devocional: true });
  });
});
