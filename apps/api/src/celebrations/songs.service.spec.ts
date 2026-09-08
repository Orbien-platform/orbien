import { NotFoundException } from '@nestjs/common';
import { SongsService } from './songs.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    song: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    setlistSong: { findMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new SongsService(prisma);
}

describe('SongsService', () => {
  describe('create', () => {
    it('persiste com tenant_id/congregation_id do usuário (REPERT-01 AC1)', async () => {
      const client = clientWith();
      client.song.create.mockResolvedValue({ id: 's1', title: 'Grande é o Senhor' });
      const service = serviceWith(client);

      const result = await service.create('t1', 'g1', { title: 'Grande é o Senhor' } as never);

      expect(client.song.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          title: 'Grande é o Senhor',
          key: null,
          bpm: null,
          link: null,
          notes: null,
        },
      });
      expect(result).toEqual({ id: 's1', title: 'Grande é o Senhor' });
    });

    it('usa os valores informados de key/bpm/link/notes quando presentes', async () => {
      const client = clientWith();
      client.song.create.mockResolvedValue({ id: 's1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        title: 'Digno é o Senhor',
        key: 'D',
        bpm: 90,
        link: 'https://cifraclub.com/x',
        notes: 'tocar mais lento',
      } as never);

      expect(client.song.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          title: 'Digno é o Senhor',
          key: 'D',
          bpm: 90,
          link: 'https://cifraclub.com/x',
          notes: 'tocar mais lento',
        },
      });
    });
  });

  describe('findAll', () => {
    it('lista ordenado por título e escopado por tenant/congregação', async () => {
      const client = clientWith();
      client.song.findMany.mockResolvedValue([]);
      client.setlistSong.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      await service.findAll('t1', 'g1');

      expect(client.song.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', congregation_id: 'g1' },
        orderBy: { title: 'asc' },
      });
    });

    it('devolve last_played_at null para música nunca tocada (REPERT-04 AC2)', async () => {
      const client = clientWith();
      client.song.findMany.mockResolvedValue([{ id: 's1', title: 'Nunca tocada' }]);
      client.setlistSong.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      const result = await service.findAll('t1', 'g1');

      expect(result).toEqual([{ id: 's1', title: 'Nunca tocada', last_played_at: null }]);
    });

    it('devolve a data mais recente entre duas instâncias em que a música apareceu (REPERT-04 AC1)', async () => {
      const client = clientWith();
      client.song.findMany.mockResolvedValue([{ id: 's1', title: 'Tocada duas vezes' }]);

      const older = new Date('2026-01-05T00:00:00Z');
      const newer = new Date('2026-03-10T00:00:00Z');
      const middle = new Date('2026-02-01T00:00:00Z');

      client.setlistSong.findMany.mockResolvedValue([
        {
          song_id: 's1',
          setlist: { serviceOrderItem: { serviceOrder: { celebrationInstance: { scheduled_date: older } } } },
        },
        {
          song_id: 's1',
          setlist: { serviceOrderItem: { serviceOrder: { celebrationInstance: { scheduled_date: newer } } } },
        },
        // Terceira ocorrência, mais antiga que a atual mais recente — não deve
        // substituir `newer` (cobre o ramo `date > current` == false).
        {
          song_id: 's1',
          setlist: { serviceOrderItem: { serviceOrder: { celebrationInstance: { scheduled_date: middle } } } },
        },
      ]);
      const service = serviceWith(client);

      const result = await service.findAll('t1', 'g1');

      expect(result).toEqual([{ id: 's1', title: 'Tocada duas vezes', last_played_at: newer }]);
    });
  });

  describe('update', () => {
    it('atualiza apenas dentro da própria congregação (validação de posse)', async () => {
      const client = clientWith();
      client.song.findFirst.mockResolvedValue({ id: 's1' });
      client.song.update.mockResolvedValue({ id: 's1', title: 'Novo título' });
      const service = serviceWith(client);

      const result = await service.update('t1', 'g1', 's1', { title: 'Novo título' } as never);

      expect(client.song.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(client.song.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { title: 'Novo título' },
      });
      expect(result).toEqual({ id: 's1', title: 'Novo título' });
    });

    it('atualiza key/bpm/link/notes sem alterar title quando title não é informado', async () => {
      const client = clientWith();
      client.song.findFirst.mockResolvedValue({ id: 's1' });
      client.song.update.mockResolvedValue({ id: 's1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 's1', {
        key: 'E',
        bpm: 100,
        link: 'https://cifraclub.com/y',
        notes: 'transpor',
      } as never);

      expect(client.song.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { key: 'E', bpm: 100, link: 'https://cifraclub.com/y', notes: 'transpor' },
      });
    });

    it('lança NotFoundException quando a música não existe na congregação do usuário', async () => {
      const client = clientWith();
      client.song.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.update('t1', 'g1', 'nope', { title: 'x' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.song.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('remove a música existente', async () => {
      const client = clientWith();
      client.song.findFirst.mockResolvedValue({ id: 's1' });
      client.song.delete.mockResolvedValue({ id: 's1' });
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 's1')).resolves.toEqual({ id: 's1' });
    });

    it('lança NotFoundException quando não existe', async () => {
      const client = clientWith();
      client.song.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
      expect(client.song.delete).not.toHaveBeenCalled();
    });
  });
});
