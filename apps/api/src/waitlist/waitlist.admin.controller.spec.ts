import { Reflector } from '@nestjs/core';
import { WaitlistAdminController } from './waitlist.admin.controller';
import { WaitlistService } from './waitlist.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { PLATFORM_ROUTE_KEY } from '../common/decorators/platform-route.decorator';

describe('WaitlistAdminController', () => {
  let waitlistService: jest.Mocked<WaitlistService>;
  let controller: WaitlistAdminController;

  beforeEach(() => {
    waitlistService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<WaitlistService>;
    controller = new WaitlistAdminController(waitlistService);
  });

  it('findAll delega ao service com a query', async () => {
    waitlistService.findAll.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

    const result = await controller.findAll({ page: 1, limit: 20 } as never);

    expect(waitlistService.findAll).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
  });

  it('findOne delega ao service com o id', async () => {
    waitlistService.findOne.mockResolvedValue({ id: 's1' } as never);

    const result = await controller.findOne('s1');

    expect(waitlistService.findOne).toHaveBeenCalledWith('s1');
    expect(result).toEqual({ id: 's1' });
  });

  it('update delega ao service com id e dto', async () => {
    waitlistService.update.mockResolvedValue({ id: 's1', status: 'contacted' } as never);

    const result = await controller.update('s1', { status: 'contacted' } as never);

    expect(waitlistService.update).toHaveBeenCalledWith('s1', { status: 'contacted' });
    expect(result).toEqual({ id: 's1', status: 'contacted' });
  });

  it('é uma rota de plataforma restrita a platform_support — nenhum papel de tenant basta', () => {
    const reflector = new Reflector();
    expect(reflector.get<string[]>(ROLES_KEY, WaitlistAdminController)).toEqual(['platform_support']);
    expect(reflector.get<boolean>(PLATFORM_ROUTE_KEY, WaitlistAdminController)).toBe(true);
  });
});
