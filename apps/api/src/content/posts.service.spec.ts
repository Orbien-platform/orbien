import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from './notifications.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    contentPost: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    postSegment: { createMany: jest.fn(), deleteMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(
  client: ReturnType<typeof clientWith>,
  opts: { storage?: Partial<StorageService>; notifications?: Partial<NotificationsService> } = {},
) {
  const prisma = {
    client,
    runInTx: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  const storageService = {
    deleteByUrl: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue('https://cdn/media.png'),
    ...opts.storage,
  } as unknown as StorageService;
  const notifications = {
    notifyPost: jest.fn().mockResolvedValue(undefined),
    ...opts.notifications,
  } as unknown as NotificationsService;
  return { service: new PostsService(prisma, storageService, notifications), storageService, notifications };
}

describe('PostsService', () => {
  describe('create', () => {
    it('cria um post como rascunho por padrão (is_draft ausente)', async () => {
      const client = clientWith();
      client.contentPost.create.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.create('t1', 'g1', 'u1', { type: 'post', title: 'Olá' } as never);

      expect(client.contentPost.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ is_draft: true, published_at: null }),
      });
    });

    it('publica imediatamente quando is_draft=false e sem publish_at', async () => {
      const client = clientWith();
      client.contentPost.create.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.create('t1', 'g1', 'u1', { type: 'post', title: 'Olá', is_draft: false } as never);

      expect(client.contentPost.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ is_draft: false, published_at: expect.any(Date) }),
      });
    });

    it('agenda publicação quando is_draft=false e publish_at é informado', async () => {
      const client = clientWith();
      client.contentPost.create.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.create('t1', 'g1', 'u1', {
        type: 'post',
        title: 'Olá',
        is_draft: false,
        publish_at: new Date('2026-10-01'),
      } as never);

      expect(client.contentPost.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ published_at: null, publish_at: new Date('2026-10-01') }),
      });
    });

    it('associa segmentos quando segment_ids é informado', async () => {
      const client = clientWith();
      client.contentPost.create.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.create('t1', 'g1', 'u1', {
        type: 'post',
        title: 'Olá',
        segment_ids: ['s1', 's2'],
      } as never);

      expect(client.postSegment.createMany).toHaveBeenCalledWith({
        data: [
          { post_id: 'p1', segment_id: 's1' },
          { post_id: 'p1', segment_id: 's2' },
        ],
        skipDuplicates: true,
      });
    });

    it('não associa segmentos quando segment_ids não é informado', async () => {
      const client = clientWith();
      client.contentPost.create.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.create('t1', 'g1', 'u1', { type: 'post', title: 'Olá' } as never);

      expect(client.postSegment.createMany).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('membro comum só vê posts publicados e ignora filtro de is_draft', async () => {
      const client = clientWith();
      client.contentPost.findMany.mockResolvedValue([{ id: 'p1' }]);
      client.contentPost.count.mockResolvedValue(1);
      const { service } = serviceWith(client);

      const result = await service.findAll('t1', 'g1', ['member'], {
        page: 1,
        limit: 20,
        is_draft: true,
      } as never);

      expect(client.contentPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ published_at: { not: null } }),
        }),
      );
      expect(client.contentPost.findMany.mock.calls[0]![0].where).not.toHaveProperty('is_draft');
      expect(result).toEqual({ data: [{ id: 'p1' }], total: 1 });
    });

    it('não membro (staff) filtra por type e is_draft quando informados', async () => {
      const client = clientWith();
      client.contentPost.findMany.mockResolvedValue([]);
      client.contentPost.count.mockResolvedValue(0);
      const { service } = serviceWith(client);

      await service.findAll('t1', 'g1', ['admin_congregation'], {
        page: 1,
        limit: 20,
        type: 'sermon_video',
        is_draft: false,
      } as never);

      expect(client.contentPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: 'sermon_video', is_draft: false }),
        }),
      );
    });

    it('filtra por since', async () => {
      const client = clientWith();
      client.contentPost.findMany.mockResolvedValue([]);
      client.contentPost.count.mockResolvedValue(0);
      const { service } = serviceWith(client);

      await service.findAll('t1', 'g1', ['admin_congregation'], {
        page: 1,
        limit: 20,
        since: '2026-01-01T00:00:00.000Z',
      } as never);

      expect(client.contentPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            published_at: { not: null, gte: new Date('2026-01-01T00:00:00.000Z') },
          }),
        }),
      );
    });

    it('sem filtros extras aplica apenas tenant/congregação', async () => {
      const client = clientWith();
      client.contentPost.findMany.mockResolvedValue([]);
      client.contentPost.count.mockResolvedValue(0);
      const { service } = serviceWith(client);

      await service.findAll('t1', 'g1', ['secretary'], { page: 2, limit: 10 } as never);

      expect(client.contentPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenant_id: 't1', congregation_id: 'g1' }, skip: 10, take: 10 }),
      );
    });
  });

  describe('findOne', () => {
    it('retorna o post quando encontrado', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      expect(await service.findOne('t1', 'g1', 'p1')).toEqual({ id: 'p1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.findOne('t1', 'g1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('atualiza apenas os campos informados', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1' });
      client.contentPost.update.mockResolvedValue({ id: 'p1', title: 'Novo' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'p1', { title: 'Novo' } as never);

      expect(client.contentPost.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { title: 'Novo' } });
    });

    it('atualiza todos os campos opcionais quando informados', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1' });
      client.contentPost.update.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'p1', {
        type: 'devotional',
        title: 'Novo',
        body: 'Corpo',
        media_url: 'https://x/a.png',
        is_draft: false,
        publish_at: new Date('2026-10-01'),
      } as never);

      expect(client.contentPost.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          type: 'devotional',
          title: 'Novo',
          body: 'Corpo',
          media_url: 'https://x/a.png',
          is_draft: false,
          publish_at: new Date('2026-10-01'),
        },
      });
    });

    it('substitui segmentos quando segment_ids é informado e não vazio', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1' });
      client.contentPost.update.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'p1', { segment_ids: ['s1'] } as never);

      expect(client.postSegment.deleteMany).toHaveBeenCalledWith({ where: { post_id: 'p1' } });
      expect(client.postSegment.createMany).toHaveBeenCalledWith({
        data: [{ post_id: 'p1', segment_id: 's1' }],
        skipDuplicates: true,
      });
    });

    it('apenas remove segmentos quando segment_ids é um array vazio', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1' });
      client.contentPost.update.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'p1', { segment_ids: [] } as never);

      expect(client.postSegment.deleteMany).toHaveBeenCalledWith({ where: { post_id: 'p1' } });
      expect(client.postSegment.createMany).not.toHaveBeenCalled();
    });

    it('não mexe em segmentos quando segment_ids não é informado', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1' });
      client.contentPost.update.mockResolvedValue({ id: 'p1' });
      const { service } = serviceWith(client);

      await service.update('t1', 'g1', 'p1', { title: 'Novo' } as never);

      expect(client.postSegment.deleteMany).not.toHaveBeenCalled();
    });

    it('lança NotFoundException quando o post não existe', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.update('t1', 'g1', 'p1', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publish', () => {
    it('publica o post e dispara a notificação (fire-and-forget)', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1' });
      client.contentPost.update.mockResolvedValue({
        id: 'p1',
        title: 'Olá',
        postSegments: [{ segment: { id: 's1' } }],
      });
      const { service, notifications } = serviceWith(client);

      const result = await service.publish('t1', 'g1', 'p1');

      expect(notifications.notifyPost).toHaveBeenCalledWith(
        { id: 'p1', title: 'Olá', postSegments: [{ segment: { id: 's1' } }] },
        [{ id: 's1' }],
      );
      expect(result.id).toBe('p1');
    });

    it('não propaga falha da notificação de publicação', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1' });
      client.contentPost.update.mockResolvedValue({ id: 'p1', postSegments: [] });
      const { service } = serviceWith(client, {
        notifications: { notifyPost: jest.fn().mockRejectedValue(new Error('falha OneSignal')) },
      });

      await expect(service.publish('t1', 'g1', 'p1')).resolves.toEqual(
        expect.objectContaining({ id: 'p1' }),
      );
      // Aguarda o catch assíncrono do fire-and-forget resolver antes do fim do teste.
      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe('remove', () => {
    it('remove o media do storage e o post', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1', media_url: 'https://x/a.png' });
      client.contentPost.delete.mockResolvedValue({ id: 'p1' });
      const { service, storageService } = serviceWith(client);

      await service.remove('t1', 'g1', 'p1');

      expect(storageService.deleteByUrl).toHaveBeenCalledWith('https://x/a.png');
      expect(client.contentPost.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });
  });

  describe('uploadMedia', () => {
    it('lança BadRequestException quando nenhum arquivo é enviado', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(service.uploadMedia('t1', 'g1', 'p1', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('lança BadRequestException quando o mimetype não é suportado', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);
      const file = { mimetype: 'text/plain', buffer: Buffer.from(''), originalname: 'a.txt' } as Express.Multer.File;

      await expect(service.uploadMedia('t1', 'g1', 'p1', file)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('substitui o media anterior e salva a nova URL', async () => {
      const client = clientWith();
      client.contentPost.findFirst.mockResolvedValue({ id: 'p1', media_url: 'https://x/old.png' });
      client.contentPost.update.mockResolvedValue({ id: 'p1' });
      const { service, storageService } = serviceWith(client);
      const file = {
        mimetype: 'image/png',
        buffer: Buffer.from('conteudo'),
        originalname: 'novo.png',
      } as Express.Multer.File;

      const result = await service.uploadMedia('t1', 'g1', 'p1', file);

      expect(storageService.deleteByUrl).toHaveBeenCalledWith('https://x/old.png');
      expect(storageService.upload).toHaveBeenCalledWith(
        file.buffer,
        expect.stringContaining('content/t1/g1/p1/'),
        'image/png',
      );
      expect(client.contentPost.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { media_url: 'https://cdn/media.png' },
      });
      expect(result).toEqual({ media_url: 'https://cdn/media.png' });
    });
  });
});
