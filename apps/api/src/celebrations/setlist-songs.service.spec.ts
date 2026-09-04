import { NotFoundException } from '@nestjs/common';
import { SetlistSongsService } from './setlist-songs.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    setlist: { findFirst: jest.fn() },
    setlistSong: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, runInTx?: jest.Mock) {
  const prisma = {
    client,
    runInTx: runInTx ?? jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  return new SetlistSongsService(prisma);
}

describe('SetlistSongsService', () => {
  describe('create', () => {
    it('lança NotFoundException quando a setlist não existe', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', { setlist_id: 'sl1', sequence: 1, title: 'Música' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria a música com campos opcionais nulos quando ausentes', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.setlistSong.create.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', { setlist_id: 'sl1', sequence: 1, title: 'Música' } as never);

      expect(client.setlistSong.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          setlist_id: 'sl1',
          sequence: 1,
          title: 'Música',
          key: null,
          bpm: null,
          link: null,
          notes: null,
        },
      });
    });

    it('cria a música com todos os campos opcionais informados', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.setlistSong.create.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        setlist_id: 'sl1',
        sequence: 1,
        title: 'Música',
        key: 'G',
        bpm: 90,
        link: 'https://x',
        notes: 'obs',
      } as never);

      expect(client.setlistSong.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ key: 'G', bpm: 90, link: 'https://x', notes: 'obs' }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('lança NotFoundException quando a setlist não existe', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findAll('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lista as músicas ordenadas por sequence', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.setlistSong.findMany.mockResolvedValue([{ id: 'song1' }]);
      const service = serviceWith(client);

      const result = await service.findAll('t1', 'g1', 'sl1');

      expect(result).toEqual([{ id: 'song1' }]);
    });
  });

  describe('findOne', () => {
    it('retorna a música quando encontrada', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'song1')).resolves.toEqual({ id: 'song1' });
    });

    it('lança NotFoundException quando não encontrada', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza todos os campos informados', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1' });
      client.setlistSong.update.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'song1', {
        sequence: 2,
        title: 'Novo título',
        key: 'D',
        bpm: 100,
        link: 'https://y',
        notes: 'novo obs',
      } as never);

      expect(client.setlistSong.update).toHaveBeenCalledWith({
        where: { id: 'song1' },
        data: {
          sequence: 2,
          title: 'Novo título',
          key: 'D',
          bpm: 100,
          link: 'https://y',
          notes: 'novo obs',
        },
      });
    });

    it('não altera nada quando dto vazio', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1' });
      client.setlistSong.update.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'song1', {} as never);

      expect(client.setlistSong.update).toHaveBeenCalledWith({ where: { id: 'song1' }, data: {} });
    });
  });

  describe('remove', () => {
    it('remove a música existente', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1' });
      client.setlistSong.delete.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await expect(service.remove('t1', 'g1', 'song1')).resolves.toEqual({ id: 'song1' });
    });
  });

  describe('reorder', () => {
    it('atualiza a sequence de cada música dentro da transação', async () => {
      const client = clientWith();
      const tx = {
        setlistSong: {
          findFirst: jest.fn().mockResolvedValue({ id: 'song1' }),
          update: jest.fn(),
        },
      };
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const service = serviceWith(client, runInTx);

      await service.reorder('t1', 'g1', {
        songs: [
          { id: 'song1', sequence: 1 },
          { id: 'song2', sequence: 2 },
        ],
      } as never);

      expect(tx.setlistSong.update).toHaveBeenCalledTimes(2);
    });

    it('lança NotFoundException quando alguma música não é encontrada dentro da tx', async () => {
      const client = clientWith();
      const tx = {
        setlistSong: {
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      };
      const runInTx = jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx));
      const service = serviceWith(client, runInTx);

      await expect(
        service.reorder('t1', 'g1', { songs: [{ id: 'nope', sequence: 1 }] } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
