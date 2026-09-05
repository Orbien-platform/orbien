import { NotFoundException } from '@nestjs/common';
import { CelebrationsService } from './celebrations.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    celebration: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    ...overrides,
  };
}

describe('CelebrationsService', () => {
  describe('create', () => {
    it('cria a celebração com day_of_week nulo quando não informado', async () => {
      const client = clientWith();
      client.celebration.create.mockResolvedValue({ id: 'c1' });
      const service = new CelebrationsService({ client } as unknown as PrismaService);

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
      const service = new CelebrationsService({ client } as unknown as PrismaService);

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

  describe('findAll', () => {
    it('filtra por type quando informado e usa is_active default true', async () => {
      const client = clientWith();
      client.celebration.findMany.mockResolvedValue([{ id: 'c1' }]);
      const service = new CelebrationsService({ client } as unknown as PrismaService);

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
      const service = new CelebrationsService({ client } as unknown as PrismaService);

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
      const service = new CelebrationsService({ client } as unknown as PrismaService);

      const result = await service.findOne('t1', 'g1', 'c1');

      expect(result).toEqual({ id: 'c1' });
    });

    it('lança NotFoundException quando não encontrada', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      const service = new CelebrationsService({ client } as unknown as PrismaService);

      await expect(service.findOne('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza todos os campos quando informados', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebration.update.mockResolvedValue({ id: 'c1' });
      const service = new CelebrationsService({ client } as unknown as PrismaService);

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
      const service = new CelebrationsService({ client } as unknown as PrismaService);

      await service.update('t1', 'g1', 'c1', {} as never);

      expect(client.celebration.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: {} });
    });

    it('lança NotFoundException quando a celebração não existe', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      const service = new CelebrationsService({ client } as unknown as PrismaService);

      await expect(service.update('t1', 'g1', 'nope', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(client.celebration.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('marca a celebração como inativa (soft delete)', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue({ id: 'c1' });
      client.celebration.update.mockResolvedValue({ id: 'c1', is_active: false });
      const service = new CelebrationsService({ client } as unknown as PrismaService);

      const result = await service.remove('t1', 'g1', 'c1');

      expect(client.celebration.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { is_active: false },
      });
      expect(result).toEqual({ id: 'c1', is_active: false });
    });

    it('lança NotFoundException quando a celebração não existe', async () => {
      const client = clientWith();
      client.celebration.findFirst.mockResolvedValue(null);
      const service = new CelebrationsService({ client } as unknown as PrismaService);

      await expect(service.remove('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
