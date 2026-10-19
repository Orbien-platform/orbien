import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    songVersion: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    setlistSong: { findMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  const prisma = { client } as unknown as PrismaService;
  return new SongsService(prisma);
}

const EMPTY_VERSION = {
  key: null,
  bpm: null,
  link: null,
  youtube_link: null,
  spotify_link: null,
  cifra_club_link: null,
  notes: null,
};

const usage = (songId: string, versionId: string | null, date: Date) => ({
  song_id: songId,
  song_version_id: versionId,
  setlist: { serviceOrderItem: { serviceOrder: { celebrationInstance: { scheduled_date: date } } } },
});

describe('SongsService', () => {
  describe('create', () => {
    it('cria a música com uma versão "Original" quando nenhuma é informada', async () => {
      const client = clientWith();
      client.song.create.mockResolvedValue({ id: 's1', title: 'Grande é o Senhor' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', { title: 'Grande é o Senhor' } as never);

      expect(client.song.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          title: 'Grande é o Senhor',
          versions: {
            create: { tenant_id: 't1', congregation_id: 'g1', label: 'Original', ...EMPTY_VERSION },
          },
        },
        include: { versions: { orderBy: { created_at: 'asc' } } },
      });
    });

    it('grava na versão inicial tudo que não é título', async () => {
      const client = clientWith();
      client.song.create.mockResolvedValue({ id: 's1' });
      const service = serviceWith(client);

      await service.create('t1', 'g1', {
        title: 'Digno é o Senhor',
        version: {
          label: 'Acústica',
          key: 'D',
          bpm: 90,
          link: 'https://cifraclub.com/x',
          youtube_link: 'https://youtube.com/watch?v=x',
          spotify_link: 'https://open.spotify.com/track/x',
          cifra_club_link: 'https://cifraclub.com.br/x',
          notes: 'tocar mais lento',
        },
      } as never);

      expect(client.song.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            versions: {
              create: {
                tenant_id: 't1',
                congregation_id: 'g1',
                label: 'Acústica',
                key: 'D',
                bpm: 90,
                link: 'https://cifraclub.com/x',
                youtube_link: 'https://youtube.com/watch?v=x',
                spotify_link: 'https://open.spotify.com/track/x',
                cifra_club_link: 'https://cifraclub.com.br/x',
                notes: 'tocar mais lento',
              },
            },
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('lista ordenado por título, com versões, escopado por tenant/congregação', async () => {
      const client = clientWith();
      client.song.findMany.mockResolvedValue([]);
      client.setlistSong.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      await service.findAll('t1', 'g1');

      expect(client.song.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', congregation_id: 'g1' },
        orderBy: { title: 'asc' },
        include: { versions: { orderBy: { created_at: 'asc' } } },
      });
    });

    it('devolve last_played_at null para música e versões nunca tocadas', async () => {
      const client = clientWith();
      client.song.findMany.mockResolvedValue([
        { id: 's1', title: 'Nunca tocada', versions: [{ id: 'v1', label: 'Original' }] },
      ]);
      client.setlistSong.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      const result = await service.findAll('t1', 'g1');

      expect(result).toEqual([
        {
          id: 's1',
          title: 'Nunca tocada',
          last_played_at: null,
          versions: [{ id: 'v1', label: 'Original', last_played_at: null }],
        },
      ]);
    });

    it('calcula a última vez tocada por música e por versão', async () => {
      const client = clientWith();
      client.song.findMany.mockResolvedValue([
        {
          id: 's1',
          title: 'Duas versões',
          versions: [
            { id: 'v1', label: 'Original' },
            { id: 'v2', label: 'Acústica' },
          ],
        },
      ]);
      const older = new Date('2026-01-05T00:00:00Z');
      const newer = new Date('2026-03-10T00:00:00Z');
      const middle = new Date('2026-02-01T00:00:00Z');
      client.setlistSong.findMany.mockResolvedValue([
        usage('s1', 'v1', older),
        usage('s1', 'v2', newer),
        // Mais antiga que a atual mais recente da música e da versão v1.
        usage('s1', 'v1', middle),
        // Setlist antiga, sem versão: conta só para a música.
        usage('s1', null, new Date('2025-12-01T00:00:00Z')),
      ]);
      const service = serviceWith(client);

      const [song] = await service.findAll('t1', 'g1');

      expect(song.last_played_at).toEqual(newer);
      expect(song.versions.map((v) => v.last_played_at)).toEqual([middle, newer]);
    });
  });

  describe('update', () => {
    it('atualiza o título apenas dentro da própria congregação', async () => {
      const client = clientWith();
      client.song.findFirst.mockResolvedValue({ id: 's1' });
      client.song.update.mockResolvedValue({ id: 's1', title: 'Novo título' });
      const service = serviceWith(client);

      await service.update('t1', 'g1', 's1', { title: 'Novo título' } as never);

      expect(client.song.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(client.song.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { title: 'Novo título' },
        include: { versions: { orderBy: { created_at: 'asc' } } },
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

  describe('versões', () => {
    it('createVersion exige a música na congregação e grava a versão com tom próprio', async () => {
      const client = clientWith();
      client.song.findFirst.mockResolvedValue({ id: 's1' });
      client.songVersion.create.mockResolvedValue({ id: 'v2' });
      const service = serviceWith(client);

      await service.createVersion('t1', 'g1', 's1', { label: 'Ao vivo', key: 'A', bpm: 80 } as never);

      expect(client.songVersion.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          song_id: 's1',
          label: 'Ao vivo',
          ...EMPTY_VERSION,
          key: 'A',
          bpm: 80,
        },
      });
    });

    it('createVersion lança NotFoundException para música de outra congregação', async () => {
      const client = clientWith();
      client.song.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.createVersion('t1', 'g1', 'nope', { label: 'x' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.songVersion.create).not.toHaveBeenCalled();
    });

    it('updateVersion altera só os campos informados, na versão da música certa', async () => {
      const client = clientWith();
      client.songVersion.findFirst.mockResolvedValue({ id: 'v1' });
      client.songVersion.update.mockResolvedValue({ id: 'v1' });
      const service = serviceWith(client);

      await service.updateVersion('t1', 'g1', 's1', 'v1', { key: 'E', bpm: 100 } as never);

      expect(client.songVersion.findFirst).toHaveBeenCalledWith({
        where: { id: 'v1', song_id: 's1', tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(client.songVersion.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { key: 'E', bpm: 100 },
      });
    });

    it('updateVersion lança NotFoundException quando a versão não é da música', async () => {
      const client = clientWith();
      client.songVersion.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.updateVersion('t1', 'g1', 's1', 'nope', { key: 'E' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.songVersion.update).not.toHaveBeenCalled();
    });

    it('removeVersion exclui quando sobra outra versão', async () => {
      const client = clientWith();
      client.songVersion.findFirst.mockResolvedValue({ id: 'v2' });
      client.songVersion.count.mockResolvedValue(2);
      client.songVersion.delete.mockResolvedValue({ id: 'v2' });
      const service = serviceWith(client);

      await expect(service.removeVersion('t1', 'g1', 's1', 'v2')).resolves.toEqual({ id: 'v2' });
      expect(client.songVersion.delete).toHaveBeenCalledWith({ where: { id: 'v2' } });
    });

    it('removeVersion recusa apagar a única versão da música', async () => {
      const client = clientWith();
      client.songVersion.findFirst.mockResolvedValue({ id: 'v1' });
      client.songVersion.count.mockResolvedValue(1);
      const service = serviceWith(client);

      await expect(service.removeVersion('t1', 'g1', 's1', 'v1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(client.songVersion.delete).not.toHaveBeenCalled();
    });
  });
});
