import { NotFoundException } from '@nestjs/common';
import { SetlistSongsService } from './setlist-songs.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    setlist: { findFirst: jest.fn() },
    song: { findFirst: jest.fn() },
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
          song_id: null,
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

    it('song_id sem overrides copia key/bpm/link do catálogo (REPERT-02 AC1)', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.song.findFirst.mockResolvedValue({ id: 'song-catalog', key: 'D', bpm: 80, link: 'https://cifra/x' });
      client.setlistSong.create.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        setlist_id: 'sl1',
        song_id: 'song-catalog',
        sequence: 1,
        title: 'Música do catálogo',
      } as never);

      expect(client.song.findFirst).toHaveBeenCalledWith({
        where: { id: 'song-catalog', tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(client.setlistSong.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          setlist_id: 'sl1',
          song_id: 'song-catalog',
          sequence: 1,
          title: 'Música do catálogo',
          key: 'D',
          bpm: 80,
          link: 'https://cifra/x',
          notes: null,
        },
      });
    });

    it('song_id com override em key mantém o valor do body, com song_id ainda setado (REPERT-02 AC2)', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.song.findFirst.mockResolvedValue({ id: 'song-catalog', key: 'D', bpm: 80, link: 'https://cifra/x' });
      client.setlistSong.create.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        setlist_id: 'sl1',
        song_id: 'song-catalog',
        sequence: 1,
        title: 'Música do catálogo',
        key: 'E',
      } as never);

      expect(client.setlistSong.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ song_id: 'song-catalog', key: 'E', bpm: 80, link: 'https://cifra/x' }),
        }),
      );
    });

    it('song_id de outro tenant/congregação lança NotFoundException (REPERT-02 AC4)', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.song.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create('t1', 'g1', {
          setlist_id: 'sl1',
          song_id: 'song-de-outro-tenant',
          sequence: 1,
          title: 'x',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.setlistSong.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('lança NotFoundException quando a setlist não existe', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findAll('t1', 'g1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lista as músicas ordenadas por sequence, com a referência do catálogo (SETREP-04 AC1)', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.setlistSong.findMany.mockResolvedValue([{ id: 'song1' }]);
      const service = serviceWith(client);

      const result = await service.findAll('t1', 'g1', 'sl1');

      expect(client.setlistSong.findMany).toHaveBeenCalledWith({
        where: { setlist_id: 'sl1', tenant_id: 't1' },
        orderBy: { sequence: 'asc' },
        include: {
          song: {
            select: {
              id: true,
              title: true,
              key: true,
              key_alt: true,
              youtube_link: true,
              spotify_link: true,
              cifra_club_link: true,
            },
          },
        },
      });
      expect(result).toEqual([{ id: 'song1' }]);
    });

    it('devolve song: null na música sem vínculo (SETREP-04 AC2)', async () => {
      const client = clientWith();
      client.setlist.findFirst.mockResolvedValue({ id: 'sl1' });
      client.setlistSong.findMany.mockResolvedValue([
        { id: 'song1', title: 'Avulsa', key: 'G', song_id: null, song: null },
      ]);
      const service = serviceWith(client);

      const result = await service.findAll('t1', 'g1', 'sl1');

      expect(result).toEqual([{ id: 'song1', title: 'Avulsa', key: 'G', song_id: null, song: null }]);
    });
  });

  describe('findOne', () => {
    it('retorna a música quando encontrada, com a referência do catálogo (SETREP-04 AC1)', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'song1')).resolves.toEqual({ id: 'song1' });
      expect(client.setlistSong.findFirst).toHaveBeenCalledWith({
        where: { id: 'song1', tenant_id: 't1', congregation_id: 'g1' },
        include: {
          song: {
            select: {
              id: true,
              title: true,
              key: true,
              key_alt: true,
              youtube_link: true,
              spotify_link: true,
              cifra_club_link: true,
            },
          },
        },
      });
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

      client.song.findFirst.mockResolvedValue({ id: 'song-catalog' });

      await service.update('t1', 'g1', 'song1', {
        song_id: 'song-catalog',
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
          song_id: 'song-catalog',
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

    it('grava song_id resolvido na própria congregação (SETREP-01 AC1)', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1', song_id: null });
      client.song.findFirst.mockResolvedValue({ id: 'song-catalog', key: 'D' });
      client.setlistSong.update.mockResolvedValue({ id: 'song1', song_id: 'song-catalog' });
      const service = serviceWith(client);

      const result = await service.update('t1', 'g1', 'song1', { song_id: 'song-catalog' } as never);

      expect(client.song.findFirst).toHaveBeenCalledWith({
        where: { id: 'song-catalog', tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(result).toEqual({ id: 'song1', song_id: 'song-catalog' });
    });

    it('song_id sozinho não toca title/key/bpm/link/notes (SETREP-01 AC2)', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1', key: 'G' });
      client.song.findFirst.mockResolvedValue({ id: 'song-catalog', key: 'D', bpm: 80, link: 'https://cifra/x' });
      client.setlistSong.update.mockResolvedValue({ id: 'song1' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 'song1', { song_id: 'song-catalog' } as never);

      expect(client.setlistSong.update).toHaveBeenCalledWith({
        where: { id: 'song1' },
        data: { song_id: 'song-catalog' },
      });
    });

    it('song_id null desvincula preservando os demais campos (SETREP-01 AC3)', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1', song_id: 'song-catalog', key: 'G' });
      client.setlistSong.update.mockResolvedValue({ id: 'song1', song_id: null, key: 'G' });
      const service = serviceWith(client);

      const result = await service.update('t1', 'g1', 'song1', { song_id: null } as never);

      expect(client.setlistSong.update).toHaveBeenCalledWith({
        where: { id: 'song1' },
        data: { song_id: null },
      });
      expect(client.song.findFirst).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'song1', song_id: null, key: 'G' });
    });

    it('song_id null numa música já avulsa é no-op efetivo (Edge Case)', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1', song_id: null, key: 'G' });
      client.setlistSong.update.mockResolvedValue({ id: 'song1', song_id: null, key: 'G' });
      const service = serviceWith(client);

      const result = await service.update('t1', 'g1', 'song1', { song_id: null } as never);

      expect(result).toEqual({ id: 'song1', song_id: null, key: 'G' });
    });

    it('song_id de outra congregação lança NotFoundException antes de gravar (SETREP-01 AC4)', async () => {
      const client = clientWith();
      client.setlistSong.findFirst.mockResolvedValue({ id: 'song1', song_id: null });
      client.song.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.update('t1', 'g1', 'song1', { song_id: 'song-de-outro-tenant' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.setlistSong.update).not.toHaveBeenCalled();
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
