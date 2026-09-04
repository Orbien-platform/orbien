import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceOrdersService } from './service-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    celebrationInstance: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    serviceOrder: { findUnique: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    serviceOrderItem: { findMany: jest.fn() },
    celebrationAssignment: { findMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, notifications?: Partial<NotificationsService>) {
  const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client));
  const prisma = { client, runInTx } as unknown as PrismaService;
  const notificationsService = {
    sendPush: jest.fn().mockResolvedValue(undefined),
    ...notifications,
  } as unknown as NotificationsService;
  return { service: new ServiceOrdersService(prisma, notificationsService), notificationsService, runInTx };
}

describe('ServiceOrdersService', () => {
  describe('create', () => {
    it('lança NotFoundException quando a instância não existe', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { celebration_instance_id: 'i1', title: 'OC' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança ConflictException quando já existe uma OC para a instância', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.serviceOrder.findUnique.mockResolvedValue({ id: 'so1' });
      const { service } = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { celebration_instance_id: 'i1', title: 'OC' } as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cria a OC quando válida', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1' });
      client.serviceOrder.findUnique.mockResolvedValue(null);
      client.serviceOrder.create.mockResolvedValue({ id: 'so1' });
      const { service } = serviceWith(client);

      const result = await service.create('t1', 'g1', {
        celebration_instance_id: 'i1',
        title: 'OC',
      } as never);

      expect(result).toEqual({ id: 'so1' });
    });
  });

  describe('findOne', () => {
    it('retorna a OC com includes quando encontrada', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1' });
      const { service } = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'so1')).resolves.toEqual({ id: 'so1' });
    });

    it('lança NotFoundException quando não encontrada', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando a OC não existe', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.update('t1', 'g1', 'nope', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('atualiza title quando informado', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1' });
      client.serviceOrder.update.mockResolvedValue({ id: 'so1', title: 'Novo' });
      const { service } = serviceWith(client);

      const result = await service.update('t1', 'g1', 'so1', { title: 'Novo' } as never);

      expect(client.serviceOrder.update).toHaveBeenCalledWith({
        where: { id: 'so1' },
        data: { title: 'Novo' },
      });
      expect(result).toEqual({ id: 'so1', title: 'Novo' });
    });

    it('não altera nada quando title ausente', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1' });
      client.serviceOrder.update.mockResolvedValue({ id: 'so1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'so1', {} as never);

      expect(client.serviceOrder.update).toHaveBeenCalledWith({ where: { id: 'so1' }, data: {} });
    });
  });

  describe('publish', () => {
    it('lança NotFoundException quando a OC não existe', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.publish('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança BadRequestException quando já publicada', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', published_at: new Date() });
      const { service } = serviceWith(client);

      await expect(service.publish('t1', 'g1', 'so1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('publica, marca a instância como published e notifica em segundo plano', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({
        id: 'so1',
        published_at: null,
        celebration_instance_id: 'i1',
      });
      const tx = {
        celebrationInstance: { update: jest.fn() },
        serviceOrder: { update: jest.fn().mockResolvedValue({ id: 'so1', published_at: new Date() }) },
      };
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const prisma = { client, runInTx } as unknown as PrismaService;
      const notificationsService = { sendPush: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
      const service = new ServiceOrdersService(prisma, notificationsService);

      client.celebrationInstance.findUnique.mockResolvedValue({
        id: 'i1',
        celebration: { name: 'Culto' },
      });
      client.serviceOrderItem.findMany.mockResolvedValue([]);

      const result = await service.publish('t1', 'g1', 'so1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(tx.celebrationInstance.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { status: 'published' },
      });
      expect(result).toEqual({ id: 'so1', published_at: expect.any(Date) });
    });

    it('loga o erro sem propagar quando a notificação de publicação falha', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({
        id: 'so1',
        published_at: null,
        celebration_instance_id: 'i1',
      });
      const tx = {
        celebrationInstance: { update: jest.fn() },
        serviceOrder: { update: jest.fn().mockResolvedValue({ id: 'so1' }) },
      };
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const prisma = { client, runInTx } as unknown as PrismaService;
      const notificationsService = { sendPush: jest.fn() } as unknown as NotificationsService;
      const service = new ServiceOrdersService(prisma, notificationsService);
      client.celebrationInstance.findUnique.mockRejectedValue(new Error('db fora'));
      const logSpy = jest.spyOn((service as unknown as { logger: { error: (m: string) => void } }).logger, 'error');

      await service.publish('t1', 'g1', 'so1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    it('lança NotFoundException quando a OC não existe', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.finalize('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança BadRequestException quando ainda não foi publicada', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({ id: 'so1', published_at: null });
      const { service } = serviceWith(client);

      await expect(service.finalize('t1', 'g1', 'so1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('finaliza e marca a instância como finalized', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue({
        id: 'so1',
        published_at: new Date(),
        celebration_instance_id: 'i1',
      });
      const { service } = serviceWith(client);

      const result = await service.finalize('t1', 'g1', 'so1');

      expect(client.celebrationInstance.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { status: 'finalized' },
      });
      expect(result).toEqual({
        id: 'so1',
        published_at: expect.any(Date),
        celebration_instance_id: 'i1',
      });
    });
  });

  describe('notifyOrderPublished (via publish)', () => {
    function setupPublish(client: ReturnType<typeof clientWith>) {
      client.serviceOrder.findFirst.mockResolvedValue({
        id: 'so1',
        published_at: null,
        celebration_instance_id: 'i1',
      });
      const tx = {
        celebrationInstance: { update: jest.fn() },
        serviceOrder: { update: jest.fn().mockResolvedValue({ id: 'so1' }) },
      };
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const prisma = { client, runInTx } as unknown as PrismaService;
      const notificationsService = { sendPush: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
      const service = new ServiceOrdersService(prisma, notificationsService);
      return { service, notificationsService };
    }

    it('não notifica quando a instância não é encontrada', async () => {
      const client = clientWith();
      const { service, notificationsService } = setupPublish(client);
      client.celebrationInstance.findUnique.mockResolvedValue(null);

      await service.publish('t1', 'g1', 'so1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(notificationsService.sendPush).not.toHaveBeenCalled();
    });

    it('não notifica quando não há itens de ministério na OC', async () => {
      const client = clientWith();
      const { service, notificationsService } = setupPublish(client);
      client.celebrationInstance.findUnique.mockResolvedValue({ id: 'i1', celebration: { name: 'Culto' } });
      client.serviceOrderItem.findMany.mockResolvedValue([]);

      await service.publish('t1', 'g1', 'so1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(notificationsService.sendPush).not.toHaveBeenCalled();
    });

    it('não notifica quando não há atribuições confirmadas', async () => {
      const client = clientWith();
      const { service, notificationsService } = setupPublish(client);
      client.celebrationInstance.findUnique.mockResolvedValue({ id: 'i1', celebration: { name: 'Culto' } });
      client.serviceOrderItem.findMany.mockResolvedValue([{ ministry_id: 'm1' }]);
      client.celebrationAssignment.findMany.mockResolvedValue([]);

      await service.publish('t1', 'g1', 'so1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(notificationsService.sendPush).not.toHaveBeenCalled();
    });

    it('notifica os voluntários confirmados dos ministérios da OC', async () => {
      const client = clientWith();
      const { service, notificationsService } = setupPublish(client);
      client.celebrationInstance.findUnique.mockResolvedValue({
        id: 'i1',
        celebration: { name: 'Culto de Celebração' },
        scheduled_date: new Date('2026-09-06T00:00:00Z'),
      });
      client.serviceOrderItem.findMany.mockResolvedValue([{ ministry_id: 'm1' }, { ministry_id: 'm1' }]);
      client.celebrationAssignment.findMany.mockResolvedValue([
        { volunteerProfile: { person_id: 'p1' } },
        { volunteerProfile: { person_id: 'p2' } },
      ]);

      await service.publish('t1', 'g1', 'so1');
      await new Promise((resolve) => setImmediate(resolve));

      expect(notificationsService.sendPush).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Ordem de Culto publicada',
          filters: [
            { field: 'tag', key: 'person_id', relation: '=', value: 'p1' },
            { operator: 'OR' },
            { field: 'tag', key: 'person_id', relation: '=', value: 'p2' },
          ],
        }),
      );
    });
  });
});
