import { SchedulerService } from './scheduler.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

function systemWith(overrides: Record<string, unknown> = {}) {
  return {
    contentPost: { findMany: jest.fn(), updateMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(system: ReturnType<typeof systemWith>, notifications?: Partial<NotificationsService>) {
  const prisma = { system } as unknown as PrismaService;
  const notificationsService = {
    notifyPost: jest.fn().mockResolvedValue(undefined),
    ...notifications,
  } as unknown as NotificationsService;
  return { service: new SchedulerService(prisma, notificationsService), notificationsService };
}

describe('SchedulerService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('publishScheduledPosts', () => {
    it('não faz nada quando não há posts pendentes', async () => {
      const system = systemWith();
      system.contentPost.findMany.mockResolvedValue([]);
      const { service } = serviceWith(system);

      await service.publishScheduledPosts();

      expect(system.contentPost.updateMany).not.toHaveBeenCalled();
    });

    it('publica os posts pendentes e notifica com sucesso', async () => {
      const system = systemWith();
      system.contentPost.findMany.mockResolvedValue([
        {
          id: 'p1',
          title: 'Olá',
          postSegments: [{ segment: { id: 's1' } }],
        },
      ]);
      system.contentPost.updateMany.mockResolvedValue({ count: 1 });
      const { service, notificationsService } = serviceWith(system);

      await service.publishScheduledPosts();

      expect(system.contentPost.findMany).toHaveBeenCalledWith({
        where: { is_draft: false, published_at: null, publish_at: { lte: new Date('2026-09-04T10:00:00Z') } },
        include: { postSegments: { include: { segment: true } } },
      });
      expect(system.contentPost.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['p1'] }, published_at: null },
        data: { published_at: new Date('2026-09-04T10:00:00Z') },
      });
      expect(notificationsService.notifyPost).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', published_at: new Date('2026-09-04T10:00:00Z') }),
        [{ id: 's1' }],
      );
    });

    it('loga erro e não interrompe o loop quando a notificação falha', async () => {
      const system = systemWith();
      system.contentPost.findMany.mockResolvedValue([
        { id: 'p1', title: 'Olá', postSegments: [] },
      ]);
      system.contentPost.updateMany.mockResolvedValue({ count: 1 });
      const { service } = serviceWith(system, {
        notifyPost: jest.fn().mockRejectedValue(new Error('falha OneSignal')),
      });
      const logSpy = jest.spyOn(
        (service as unknown as { logger: { error: (m: string) => void } }).logger,
        'error',
      );

      await service.publishScheduledPosts();
      // Aguarda o catch assíncrono do fire-and-forget resolver antes da asserção.
      // Timers estão fake neste describe, então usamos ticks de microtask (não
      // setImmediate/macrotask) para não depender do relógio.
      await Promise.resolve();
      await Promise.resolve();

      expect(logSpy).toHaveBeenCalled();
    });
  });
});
