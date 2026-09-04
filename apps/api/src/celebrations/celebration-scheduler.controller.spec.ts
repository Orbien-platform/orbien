import { Reflector } from '@nestjs/core';
import { CelebrationSchedulerController } from './celebration-scheduler.controller';
import { CelebrationSchedulerService } from './celebration-scheduler.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

function rolesFor(): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, CelebrationSchedulerController);
}

describe('CelebrationSchedulerController', () => {
  let schedulerService: jest.Mocked<CelebrationSchedulerService>;
  let controller: CelebrationSchedulerController;

  beforeEach(() => {
    schedulerService = {
      generateInstances: jest.fn(),
      sendHostReminders: jest.fn(),
    } as unknown as jest.Mocked<CelebrationSchedulerService>;

    controller = new CelebrationSchedulerController(schedulerService);
  });

  it('a controller inteira exige o papel platform_support', () => {
    expect(rolesFor()).toEqual(['platform_support']);
  });

  it('generateInstances delega ao service', async () => {
    schedulerService.generateInstances.mockResolvedValue({ celebrations_processed: 3, tenants: {} });

    const result = await controller.generateInstances();

    expect(schedulerService.generateInstances).toHaveBeenCalledWith();
    expect(result).toEqual({ celebrations_processed: 3, tenants: {} });
  });

  it('sendHostReminders delega ao service', async () => {
    schedulerService.sendHostReminders.mockResolvedValue({ instances_checked: 1, sent: 1, errors: 0 });

    const result = await controller.sendHostReminders();

    expect(schedulerService.sendHostReminders).toHaveBeenCalledWith();
    expect(result).toEqual({ instances_checked: 1, sent: 1, errors: 0 });
  });
});
