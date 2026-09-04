import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

function prismaWith(overrides: {
  system?: Record<string, unknown>;
  client?: Record<string, unknown>;
} = {}) {
  const system = {
    audienceSegment: { findMany: jest.fn() },
    notificationDispatch: { findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
    ...overrides.system,
  };
  const client = {
    notificationDispatch: { findFirst: jest.fn() },
    ...overrides.client,
  };
  const prisma = { system, client } as unknown as PrismaService;
  return { prisma, system, client };
}

const ORIGINAL_ENV = process.env;

describe('NotificationsService', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  describe('notifyPost', () => {
    it('usa o corpo do post truncado em 200 caracteres quando presente', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      process.env['ONESIGNAL_API_KEY'] = 'key1';
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'osig1' }) });
      const { prisma, system } = prismaWith();
      const service = new NotificationsService(prisma);

      await service.notifyPost(
        { id: 'p1', tenant_id: 't1', congregation_id: 'g1', title: 'Título', body: 'x'.repeat(300), type: 'post' } as never,
        [],
      );

      const payload = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
      expect(payload.contents.pt).toHaveLength(200);
      expect(system.notificationDispatch.create).toHaveBeenCalled();
    });

    it('usa o título como corpo quando o post não tem body', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      process.env['ONESIGNAL_API_KEY'] = 'key1';
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'osig1' }) });
      const { prisma } = prismaWith();
      const service = new NotificationsService(prisma);

      await service.notifyPost(
        { id: 'p1', tenant_id: 't1', congregation_id: 'g1', title: 'Título', body: null, type: 'post' } as never,
        [],
      );

      const payload = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
      expect(payload.contents.pt).toBe('Título');
    });
  });

  describe('sendManualNotification', () => {
    it('busca os segmentos quando segment_ids não é vazio', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      system.audienceSegment.findMany.mockResolvedValue([{ criteria: { roles: ['member'] } }]);
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'osig1' }) });
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', {
        title: 'Aviso',
        body: 'x'.repeat(300),
        segment_ids: ['s1'],
      } as never);

      expect(system.audienceSegment.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['s1'] }, tenant_id: 't1' },
      });
    });

    it('não busca segmentos quando segment_ids é vazio', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'osig1' }) });
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', {
        title: 'Aviso',
        body: 'Corpo',
        segment_ids: [],
      } as never);

      expect(system.audienceSegment.findMany).not.toHaveBeenCalled();
    });
  });

  describe('sendPush', () => {
    it('delega diretamente para dispatch', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'osig1' }) });
      const service = new NotificationsService(prisma);

      await service.sendPush({
        tenantId: 't1',
        congregationId: 'g1',
        contentPostId: null,
        title: 'T',
        body: 'B',
        filters: [],
        data: {},
      });

      expect(system.notificationDispatch.create).toHaveBeenCalled();
    });
  });

  describe('syncNotificationMetrics (cron)', () => {
    it('delega para syncMetrics', async () => {
      const { prisma, system } = prismaWith();
      system.notificationDispatch.findMany.mockResolvedValue([]);
      const service = new NotificationsService(prisma);
      const spy = jest.spyOn(service, 'syncMetrics');

      await service.syncNotificationMetrics();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('syncMetrics', () => {
    it('sai sem consultar quando ONESIGNAL_APP_ID não está configurado', async () => {
      delete process.env['ONESIGNAL_APP_ID'];
      const { prisma, system } = prismaWith();
      const service = new NotificationsService(prisma);

      await service.syncMetrics();

      expect(system.notificationDispatch.findMany).not.toHaveBeenCalled();
    });

    it('atualiza reached/opened quando o OneSignal responde ok', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      process.env['ONESIGNAL_API_KEY'] = 'key1';
      const { prisma, system } = prismaWith();
      system.notificationDispatch.findMany.mockResolvedValue([{ id: 'd1', onesignal_id: 'osig1' }]);
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ successful: 5, converted: 2 }) });
      const service = new NotificationsService(prisma);

      await service.syncMetrics();

      expect(system.notificationDispatch.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { reached: 5, opened: 2 },
      });
    });

    it('grava reached/opened como null quando a resposta não traz os campos', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      system.notificationDispatch.findMany.mockResolvedValue([{ id: 'd1', onesignal_id: 'osig1' }]);
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const service = new NotificationsService(prisma);

      await service.syncMetrics();

      expect(system.notificationDispatch.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { reached: null, opened: null },
      });
    });

    it('não atualiza e loga aviso quando o OneSignal responde com erro', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      system.notificationDispatch.findMany.mockResolvedValue([{ id: 'd1', onesignal_id: 'osig1' }]);
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
      const service = new NotificationsService(prisma);

      await service.syncMetrics();

      expect(system.notificationDispatch.update).not.toHaveBeenCalled();
    });

    it('captura exceção de rede e continua', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      system.notificationDispatch.findMany.mockResolvedValue([{ id: 'd1', onesignal_id: 'osig1' }]);
      fetchMock.mockRejectedValue(new Error('rede fora'));
      const service = new NotificationsService(prisma);

      await expect(service.syncMetrics()).resolves.toBeUndefined();
      expect(system.notificationDispatch.update).not.toHaveBeenCalled();
    });
  });

  describe('getMetrics', () => {
    it('retorna o dispatch com o título do post associado', async () => {
      const { prisma, client } = prismaWith();
      client.notificationDispatch.findFirst.mockResolvedValue({
        id: 'd1',
        contentPost: { title: 'Post título' },
      });
      const service = new NotificationsService(prisma);

      const result = await service.getMetrics('t1', 'g1', 'd1');

      expect(result).toEqual({ id: 'd1', title: 'Post título' });
    });

    it('retorna título nulo quando não há post associado', async () => {
      const { prisma, client } = prismaWith();
      client.notificationDispatch.findFirst.mockResolvedValue({ id: 'd1', contentPost: null });
      const service = new NotificationsService(prisma);

      const result = await service.getMetrics('t1', 'g1', 'd1');

      expect(result).toEqual({ id: 'd1', title: null });
    });

    it('lança NotFoundException quando o dispatch não existe', async () => {
      const { prisma, client } = prismaWith();
      client.notificationDispatch.findFirst.mockResolvedValue(null);
      const service = new NotificationsService(prisma);

      await expect(service.getMetrics('t1', 'g1', 'd1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('buildFilters (via sendManualNotification)', () => {
    async function filtersFor(segments: unknown[]) {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      system.audienceSegment.findMany.mockResolvedValue(segments);
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'osig1' }) });
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', {
        title: 'T',
        body: 'B',
        segment_ids: ['s1'],
      } as never);

      const payload = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
      return payload.filters;
    }

    it('sem segmentos filtra por tenant_id', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma } = prismaWith();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'osig1' }) });
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', { title: 'T', body: 'B', segment_ids: [] } as never);

      const payload = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body);
      expect(payload.filters).toEqual([{ field: 'tag', key: 'tenant_id', relation: '=', value: 't1' }]);
    });

    it('segmento sem critérios reconhecidos cai no fallback de tenant inteiro', async () => {
      const filters = await filtersFor([{ criteria: {} }]);
      expect(filters).toEqual([{ field: 'tag', key: 'tenant_id', relation: '=', value: 't1' }]);
    });

    it('segmento com criteria null trata como objeto vazio (fallback de tenant inteiro)', async () => {
      const filters = await filtersFor([{ criteria: null }]);
      expect(filters).toEqual([{ field: 'tag', key: 'tenant_id', relation: '=', value: 't1' }]);
    });

    it('combina congregation_ids, group_ids e roles com OR interno e AND entre grupos', async () => {
      const filters = await filtersFor([
        {
          criteria: {
            congregation_ids: ['g1', 'g2'],
            group_ids: ['grp1'],
            roles: ['member', 'pastor'],
          },
        },
      ]);

      expect(filters).toEqual([
        { field: 'tag', key: 'congregation_id', relation: '=', value: 'g1' },
        { operator: 'OR' },
        { field: 'tag', key: 'congregation_id', relation: '=', value: 'g2' },
        { field: 'tag', key: 'pg_ids', relation: '=', value: 'grp1' },
        { field: 'tag', key: 'role', relation: '=', value: 'member' },
        { operator: 'OR' },
        { field: 'tag', key: 'role', relation: '=', value: 'pastor' },
      ]);
    });

    it('faz OR entre múltiplos segmentos', async () => {
      const filters = await filtersFor([
        { criteria: { roles: ['member'] } },
        { criteria: { roles: ['pastor'] } },
      ]);

      expect(filters).toEqual([
        { field: 'tag', key: 'role', relation: '=', value: 'member' },
        { operator: 'OR' },
        { field: 'tag', key: 'role', relation: '=', value: 'pastor' },
      ]);
    });
  });

  describe('dispatch', () => {
    it('cria dispatch com status failed sem chamar a API quando ONESIGNAL_APP_ID não está configurado', async () => {
      delete process.env['ONESIGNAL_APP_ID'];
      const { prisma, system } = prismaWith();
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', { title: 'T', body: 'B', segment_ids: [] } as never);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(system.notificationDispatch.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed', onesignal_id: null }) }),
      );
    });

    it('marca status failed quando o OneSignal responde com erro', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ errors: ['boom'] }) });
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', { title: 'T', body: 'B', segment_ids: [] } as never);

      expect(system.notificationDispatch.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
      );
    });

    it('marca status sent com o onesignal_id quando a chamada é bem-sucedida', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: 'osig-xyz' }) });
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', { title: 'T', body: 'B', segment_ids: [] } as never);

      expect(system.notificationDispatch.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'sent', onesignal_id: 'osig-xyz' }) }),
      );
    });

    it('marca onesignal_id null quando a resposta ok não traz id', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', { title: 'T', body: 'B', segment_ids: [] } as never);

      expect(system.notificationDispatch.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'sent', onesignal_id: null }) }),
      );
    });

    it('marca status failed quando a chamada lança exceção', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const { prisma, system } = prismaWith();
      fetchMock.mockRejectedValue(new Error('rede fora'));
      const service = new NotificationsService(prisma);

      await service.sendManualNotification('t1', 'g1', { title: 'T', body: 'B', segment_ids: [] } as never);

      expect(system.notificationDispatch.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed', onesignal_id: null }) }),
      );
    });
  });
});
