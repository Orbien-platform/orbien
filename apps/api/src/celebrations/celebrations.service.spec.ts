import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CelebrationsService } from './celebrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CelebrationRemovalNotifier } from './celebration-removal.notifier';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    celebration: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    celebrationInstance: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
    },
    ...overrides,
  };
}

function notifierMock(snapshot: unknown = null) {
  return {
    snapshotCancellation: jest.fn().mockResolvedValue(snapshot),
    notifyCancelled: jest.fn(),
  };
}

function serviceFor(client: unknown, notifier = notifierMock()) {
  return new CelebrationsService(
    { client } as unknown as PrismaService,
    notifier as unknown as CelebrationRemovalNotifier,
  );
}

describe('CelebrationsService', () => {
  describe('create', () => {
    it('cria a celebração com day_of_week nulo quando não informado', async () => {
      const client = clientWith();
      client.celebration.create.mockResolvedValue({ id: 'c1' });
      const service = serviceFor(client);

      const result = await service.create('t1', 'g1', {
        name: 'Culto',
        type: 'sunday_service',
        start_time: '19:00',
        recurrence: 'weekly',
      } as never);

      expect(client.celebration.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          name: 'Culto',
          type: 'sunday_service',
          day_of_week: null,
          start_time: '19:00',
          recurrence: 'weekly',
        },
      });
      expect(result).toEqual({ id: 'c1' });
    });

    it('cria a celebração com day_of_week informado', async () => {
      const client = clientWith();
      client.celebration.create.mockResolvedValue({ id: 'c1' });
      const service = serviceFor(client);

      await service.create('t1', 'g1', {
        name: 'Culto',
        type: 'sunday_service',
        day_of_week: 0,
        start_time: '19:00',
        recurrence: 'weekly',
      } as never);

      expect(client.celebration.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ day_of_week: 0 }) }),
      );
    });
  });

  describe('create (avulsa)', () => {
    const base = { name: 'Vigília', type: 'sunday_service', start_time: '09:00', recurrence: 'none' };

    it('cria a instância na data informada e deriva day_of_week dela', async () => {
      const client = clientWith();
      client.celebration.create.mockResolvedValue({ id: 'c1' });
      const service = serviceFor(client);

      await service.create('t1', 'g1', { ...base, scheduled_date: '2026-10-11' } as never);

      expect(client.celebration.create.mock.calls[0][0].data.day_of_week).toBe(0);
      expect(client.celebrationInstance.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          celebration_id: 'c1',
          scheduled_date: new Date('2026-10-11T00:00:00.000Z'),
        },
      });
    });

    it('exige scheduled_date e não grava nada sem ela', async () => {
      const client = clientWith();
      const service = serviceFor(client);

      await expect(service.create('t1', 'g1', base as never)).rejects.toThrow(BadRequestException);
      expect(client.celebration.create).not.toHaveBeenCalled();
    });

    it('rejeita data inexistente', async () => {
      const client = clientWith();
      const service = serviceFor(client);

      await expect(
        service.create('t1', 'g1', { ...base, scheduled_date: '2026-02-30' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('recorrente não cria instância', async () => {
      const client = clientWith();
      client.celebration.create.mockResolvedValue({ id: 'c1' });
      const service = serviceFor(client);

      await service.create('t1', 'g1', { ...base, recurrence: 'weekly' } as never);
      expect(client.celebrationInstance.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('filtra por type quando informado e usa is_active default true', async () => {
      const client = clientWith();
      client.celebration.findMany.mockResolvedValue([{ id: 'c1' }]);
      const service = serviceFor(client);

      const result = await service.findAll('t1', { type: 'sunday_service' } as never);

      expect(client.celebration.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', type: 'sunday_service', is_active: true },
        orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
      });
      expect(result).toEqual([{ id: 'c1' }]);
    });

    it('não filtra por type quando ausente e respeita is_active informado', async () => {
      const client = clientWith();
      client.celebration.findMany.mockResolvedValue([]);
      const service = serviceFor(client);

      await service.findAll('t1', { is_active: false } as never);

      expect(client.celebration.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', is_active: false },
        orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
      });
    });
  });

  describe('findOne', () => {
    it('retorna a celebração quando encontrada', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      const service = serviceFor(client);

      const result = await service.findOne('t1', 'g1', 'c1');

      expect(result).toEqual({ id: 'c1' });
    });

    it('lança NotFoundException quando não encontrada', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      const service = serviceFor(client);

      await expect(service.findOne('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza todos os campos quando informados', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebration.update.mockResolvedValue({ id: 'c1' });
      const service = serviceFor(client);

      await service.update('t1', 'g1', 'c1', {
        name: 'Novo nome',
        type: 'prayer_meeting',
        day_of_week: 3,
        start_time: '20:00',
        recurrence: 'monthly',
      } as never);

      expect(client.celebration.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: {
          name: 'Novo nome',
          type: 'prayer_meeting',
          day_of_week: 3,
          start_time: '20:00',
          recurrence: 'monthly',
        },
      });
    });

    it('não altera nenhum campo quando dto vazio', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebration.update.mockResolvedValue({ id: 'c1' });
      const service = serviceFor(client);

      await service.update('t1', 'g1', 'c1', {} as never);

      expect(client.celebration.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: {} });
    });

    it('lança NotFoundException quando a celebração não existe', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      const service = serviceFor(client);

      await expect(service.update('t1', 'g1', 'nope', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(client.celebration.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    afterEach(() => jest.useRealTimers());

    it('marca a celebração como inativa (soft delete) e informa quantas instâncias removeu', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebration.update.mockResolvedValue({ id: 'c1', is_active: false });
      client.celebrationInstance.deleteMany.mockResolvedValue({ count: 3 });
      const service = serviceFor(client);

      const result = await service.remove('t1', 'g1', 'c1');

      expect(client.celebration.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { is_active: false },
      });
      expect(result).toEqual({ id: 'c1', is_active: false, removed_instances: 3 });
    });

    it('apaga só as instâncias de hoje em diante que não foram finalizadas', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-10T15:30:00Z'));
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebration.update.mockResolvedValue({ id: 'c1' });
      const service = serviceFor(client);

      await service.remove('t1', 'g1', 'c1');

      expect(client.celebrationInstance.deleteMany).toHaveBeenCalledWith({
        where: {
          celebration_id: 'c1',
          tenant_id: 't1',
          scheduled_date: { gte: new Date('2026-09-10T00:00:00Z') },
          status: { not: 'finalized' },
        },
      });
    });

    it('lança NotFoundException quando a celebração não existe, sem apagar nada', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      const service = serviceFor(client);

      await expect(service.remove('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(client.celebrationInstance.deleteMany).not.toHaveBeenCalled();
    });

    describe('aviso a quem estava escalado (PEND-20)', () => {
      beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-10T15:30:00Z')));

      it('lê os destinatários das instâncias futuras ANTES do deleteMany, um aviso para o lote', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({ id: 'c1', name: 'Culto da Família', congregation_id: 'g1' });
        client.celebration.update.mockResolvedValue({ id: 'c1' });
        client.celebrationInstance.findMany.mockResolvedValue([{ id: 'i1' }, { id: 'i2' }]);
        client.celebrationInstance.deleteMany.mockResolvedValue({ count: 2 });
        const notifier = notifierMock({ any: 'snapshot' });
        const service = serviceFor(client, notifier);

        await service.remove('t1', 'g1', 'c1');

        expect(client.celebrationInstance.findMany).toHaveBeenCalledWith({
          where: {
            celebration_id: 'c1',
            tenant_id: 't1',
            scheduled_date: { gte: new Date('2026-09-10T00:00:00Z') },
            status: { notIn: ['finalized', 'cancelled'] },
          },
          select: { id: true },
        });
        expect(notifier.snapshotCancellation).toHaveBeenCalledTimes(1);
        expect(notifier.snapshotCancellation).toHaveBeenCalledWith('t1', 'Culto da Família', 'g1', ['i1', 'i2']);
        expect(notifier.notifyCancelled).toHaveBeenCalledTimes(1);
        const order = [
          notifier.snapshotCancellation.mock.invocationCallOrder[0],
          client.celebrationInstance.deleteMany.mock.invocationCallOrder[0],
          notifier.notifyCancelled.mock.invocationCallOrder[0],
        ];
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(notifier.notifyCancelled).toHaveBeenCalledWith('t1', { any: 'snapshot' });
      });

      it('sem instâncias futuras ainda ativas, o snapshot vem vazio e nada é enviado', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue({ id: 'c1', name: 'Culto', congregation_id: 'g1' });
        client.celebration.update.mockResolvedValue({ id: 'c1' });
        const notifier = notifierMock(null);
        const service = serviceFor(client, notifier);

        await service.remove('t1', 'g1', 'c1');

        expect(notifier.snapshotCancellation).toHaveBeenCalledWith('t1', 'Culto', 'g1', []);
        expect(notifier.notifyCancelled).toHaveBeenCalledWith('t1', null);
      });

      it('não avisa quando a celebração não existe', async () => {
        const client = clientWith();
        client.celebration.findFirst.mockResolvedValue(null);
        const notifier = notifierMock({ any: 'snapshot' });
        const service = serviceFor(client, notifier);

        await expect(service.remove('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
        expect(notifier.snapshotCancellation).not.toHaveBeenCalled();
        expect(notifier.notifyCancelled).not.toHaveBeenCalled();
      });
    });
  });
});
