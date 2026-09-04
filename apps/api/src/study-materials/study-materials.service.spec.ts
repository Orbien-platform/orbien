import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudyMaterialsService } from './study-materials.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['secretary'],
  plan: 'premium',
};

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    smallGroup: { findMany: jest.fn() },
    studyMaterial: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    materialTarget: { findMany: jest.fn(), createMany: jest.fn() },
    groupMembership: { findMany: jest.fn() },
    userAccount: { findUnique: jest.fn() },
    materialOpenRecord: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
    ...overrides,
  };
}

function systemWith(overrides: Record<string, unknown> = {}) {
  return {
    studyMaterial: { findMany: jest.fn(), update: jest.fn() },
    ...overrides,
  };
}

function serviceWith(
  client: ReturnType<typeof clientWith>,
  opts: { system?: ReturnType<typeof systemWith>; storage?: Partial<StorageService>; runInTx?: jest.Mock } = {},
) {
  const system = opts.system ?? systemWith();
  const prisma = {
    client,
    system,
    runInTx: opts.runInTx ?? jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  const storageService = {
    deleteByUrl: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue('https://cdn/materiais/a.pdf'),
    ...opts.storage,
  } as unknown as StorageService;
  return { service: new StudyMaterialsService(prisma, storageService), storageService, system };
}

describe('StudyMaterialsService', () => {
  describe('create', () => {
    it('lança BadRequestException quando source_type é pdf/doc e nenhum arquivo é enviado', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(
        service.create({ source_type: 'pdf', publish_at: '2026-09-10' } as never, undefined, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança BadRequestException quando source_type é rich_text sem rich_content', async () => {
      const client = clientWith();
      const { service } = serviceWith(client);

      await expect(
        service.create({ source_type: 'rich_text', publish_at: '2026-09-10' } as never, undefined, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança BadRequestException quando algum target_group_id informado não existe na congregação', async () => {
      const client = clientWith();
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }]);
      const { service } = serviceWith(client);

      await expect(
        service.create(
          {
            source_type: 'rich_text',
            rich_content: 'x',
            publish_at: '2026-09-10',
            target_group_ids: ['g1', 'g2'],
          } as never,
          undefined,
          USER,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cria o material com upload de arquivo, usando ".bin" quando o arquivo não tem extensão', async () => {
      const client = clientWith();
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
      client.studyMaterial.create.mockResolvedValue({ id: 'm1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);
      const file = { originalname: 'semext', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

      await service.create({ source_type: 'pdf', publish_at: '2026-09-10' } as never, file, USER);

      expect(storageService.upload).toHaveBeenCalledWith(file.buffer, expect.stringContaining('.bin'), 'application/pdf');
    });

    it('cria o material com todos os grupos da congregação quando target_group_ids não é informado', async () => {
      const client = clientWith();
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
      client.studyMaterial.create.mockResolvedValue({ id: 'm1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      const { service } = serviceWith(client);

      await service.create(
        { source_type: 'rich_text', rich_content: 'x', publish_at: '2026-09-10' } as never,
        undefined,
        USER,
      );

      expect(client.smallGroup.findMany).toHaveBeenCalledWith({
        where: { congregation_id: 'g1' },
        select: { id: true },
      });
      expect(client.studyMaterial.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expires_at: undefined, tags: [] }),
        }),
      );
    });

    it('usa os target_group_ids informados quando todos existem, e cria os materialTargets', async () => {
      const client = clientWith();
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }]);
      client.studyMaterial.create.mockResolvedValue({ id: 'm1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      const { service } = serviceWith(client);

      await service.create(
        {
          source_type: 'rich_text',
          rich_content: 'x',
          publish_at: '2026-09-10',
          expires_at: '2026-12-01',
          tags: ['fé'],
          target_group_ids: ['g1'],
        } as never,
        undefined,
        USER,
      );

      expect(client.materialTarget.createMany).toHaveBeenCalledWith({
        data: [{ study_material_id: 'm1', small_group_id: 'g1' }],
        skipDuplicates: true,
      });
    });

    it('não cria materialTargets quando não há grupos alvo', async () => {
      const client = clientWith();
      client.smallGroup.findMany.mockResolvedValue([]);
      client.studyMaterial.create.mockResolvedValue({ id: 'm1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      const { service } = serviceWith(client);

      await service.create(
        { source_type: 'rich_text', rich_content: 'x', publish_at: '2026-09-10' } as never,
        undefined,
        USER,
      );

      expect(client.materialTarget.createMany).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('filtra por status scheduled', async () => {
      const client = clientWith();
      client.studyMaterial.findMany.mockResolvedValue([]);
      client.studyMaterial.count.mockResolvedValue(0);
      const { service } = serviceWith(client);

      await service.findAll({ status: 'scheduled', page: 1, limit: 20 } as never);

      expect(client.studyMaterial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ publish_at: { gt: expect.any(Date) } }) }),
      );
    });

    it('filtra por status published', async () => {
      const client = clientWith();
      client.studyMaterial.findMany.mockResolvedValue([]);
      client.studyMaterial.count.mockResolvedValue(0);
      const { service } = serviceWith(client);

      await service.findAll({ status: 'published', page: 1, limit: 20 } as never);

      expect(client.studyMaterial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            publish_at: { lte: expect.any(Date) },
            OR: [{ expires_at: null }, { expires_at: { gt: expect.any(Date) } }],
          }),
        }),
      );
    });

    it('filtra por status expired', async () => {
      const client = clientWith();
      client.studyMaterial.findMany.mockResolvedValue([]);
      client.studyMaterial.count.mockResolvedValue(0);
      const { service } = serviceWith(client);

      await service.findAll({ status: 'expired', page: 1, limit: 20 } as never);

      expect(client.studyMaterial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ expires_at: { lte: expect.any(Date) } }) }),
      );
    });

    it('sem status computa published/scheduled/expired no resultado e aceita search', async () => {
      const client = clientWith();
      const now = Date.now();
      client.studyMaterial.findMany.mockResolvedValue([
        { id: 'm1', publish_at: new Date(now + 10_000), expires_at: null },
        { id: 'm2', publish_at: new Date(now - 10_000), expires_at: new Date(now - 5_000) },
        { id: 'm3', publish_at: new Date(now - 10_000), expires_at: null },
      ]);
      client.studyMaterial.count.mockResolvedValue(3);
      const { service } = serviceWith(client);

      const result = await service.findAll({ search: 'estudo', page: 1, limit: 20 } as never);

      expect(client.studyMaterial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ title: { contains: 'estudo', mode: 'insensitive' } }) }),
      );
      expect(result.data.map((m) => m.status)).toEqual(['scheduled', 'expired', 'published']);
      expect(result.total).toBe(3);
    });
  });

  describe('findOne', () => {
    it('retorna o material com o status calculado', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({
        id: 'm1',
        publish_at: new Date(Date.now() - 10_000),
        expires_at: null,
      });
      const { service } = serviceWith(client);

      const result = await service.findOne('m1');

      expect(result.status).toBe('published');
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.findOne('m1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando o material não existe', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.update('m1', {} as never, undefined, USER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('atualiza sem trocar arquivo quando nenhum é enviado', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1', file_url: 'https://cdn/old.pdf' });
      client.studyMaterial.update.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);

      await service.update('m1', { title: 'Novo' } as never, undefined, USER);

      expect(storageService.deleteByUrl).not.toHaveBeenCalled();
      expect(client.studyMaterial.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { title: 'Novo', version: { increment: 1 } },
      });
    });

    it('substitui o arquivo, removendo o antigo e enviando o novo', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1', file_url: 'https://cdn/old.pdf' });
      client.studyMaterial.update.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);
      const file = { originalname: 'novo.PDF', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

      await service.update('m1', {} as never, file, USER);

      expect(storageService.deleteByUrl).toHaveBeenCalledWith('https://cdn/old.pdf');
      expect(storageService.upload).toHaveBeenCalledWith(file.buffer, expect.stringContaining('.pdf'), 'application/pdf');
      expect(client.studyMaterial.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { file_url: 'https://cdn/materiais/a.pdf', version: { increment: 1 } },
      });
    });

    it('usa ".bin" como extensão quando o novo arquivo não tem uma', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1', file_url: null });
      client.studyMaterial.update.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);
      const file = { originalname: 'semext', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

      await service.update('m1', {} as never, file, USER);

      expect(storageService.upload).toHaveBeenCalledWith(file.buffer, expect.stringContaining('.bin'), 'application/pdf');
    });

    it('converte publish_at e expires_at quando informados', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1', file_url: null });
      client.studyMaterial.update.mockResolvedValue({ id: 'm1' });
      const { service } = serviceWith(client);

      await service.update(
        'm1',
        { publish_at: '2026-09-10T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z' } as never,
        undefined,
        USER,
      );

      expect(client.studyMaterial.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: expect.objectContaining({
          publish_at: new Date('2026-09-10T00:00:00.000Z'),
          expires_at: new Date('2026-12-01T00:00:00.000Z'),
          version: { increment: 1 },
        }),
      });
    });
  });

  describe('remove', () => {
    it('lança NotFoundException quando o material não existe', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.remove('m1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove o arquivo do storage e o material', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1', file_url: 'https://cdn/a.pdf' });
      client.studyMaterial.delete.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);

      await service.remove('m1');

      expect(storageService.deleteByUrl).toHaveBeenCalledWith('https://cdn/a.pdf');
      expect(client.studyMaterial.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });

  describe('recordOpen', () => {
    it('não registra quando a conta não está vinculada a uma pessoa', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const { service } = serviceWith(client);

      const result = await service.recordOpen('m1', USER);

      expect(result).toEqual({ recorded: false, reason: 'user_account_not_linked_to_person' });
    });

    it('não registra novamente quando já existe abertura registrada', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.materialOpenRecord.findFirst.mockResolvedValue({ id: 'rec1' });
      const { service } = serviceWith(client);

      const result = await service.recordOpen('m1', USER);

      expect(result).toEqual({ recorded: false, already_opened: true });
      expect(client.materialOpenRecord.create).not.toHaveBeenCalled();
    });

    it('registra a abertura quando ainda não existe', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.materialOpenRecord.findFirst.mockResolvedValue(null);
      client.materialOpenRecord.create.mockResolvedValue({ id: 'rec1' });
      const { service } = serviceWith(client);

      const result = await service.recordOpen('m1', USER);

      expect(client.materialOpenRecord.create).toHaveBeenCalledWith({
        data: { tenant_id: 't1', congregation_id: 'g1', study_material_id: 'm1', person_id: 'p1' },
      });
      expect(result).toEqual({ recorded: true, record: { id: 'rec1' } });
    });
  });

  describe('getOpenStats', () => {
    it('lança NotFoundException quando o material não existe', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.getOpenStats('m1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('calcula o percentual de abertura', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      client.materialTarget.findMany.mockResolvedValue([{ small_group_id: 'g1' }]);
      client.groupMembership.findMany.mockResolvedValue([{ person_id: 'p1' }, { person_id: 'p2' }]);
      client.materialOpenRecord.count.mockResolvedValue(1);
      const { service } = serviceWith(client);

      const result = await service.getOpenStats('m1');

      expect(result).toEqual({ total_targets: 2, opened: 1, percentage: 50 });
    });

    it('retorna percentual 0 quando não há membros-alvo (evita divisão por zero)', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      client.materialTarget.findMany.mockResolvedValue([]);
      client.groupMembership.findMany.mockResolvedValue([]);
      client.materialOpenRecord.count.mockResolvedValue(0);
      const { service } = serviceWith(client);

      const result = await service.getOpenStats('m1');

      expect(result).toEqual({ total_targets: 0, opened: 0, percentage: 0 });
    });
  });

  describe('publishPending', () => {
    const ORIGINAL_ENV = process.env;
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

    it('não faz nada quando ONESIGNAL_APP_ID não está configurado', async () => {
      delete process.env['ONESIGNAL_APP_ID'];
      const client = clientWith();
      const system = systemWith();
      const { service } = serviceWith(client, { system });

      await service.publishPending();

      expect(system.studyMaterial.findMany).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('não faz nada quando não há materiais pendentes', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const client = clientWith();
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([]);
      const { service } = serviceWith(client, { system });

      await service.publishPending();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('notifica e marca notified_at quando o OneSignal responde ok', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      process.env['ONESIGNAL_REST_API_KEY'] = 'key1';
      const client = clientWith();
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([{ id: 'm1', title: 'Estudo', congregation_id: 'g1' }]);
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
      const { service } = serviceWith(client, { system });

      await service.publishPending();

      expect(system.studyMaterial.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { notified_at: expect.any(Date) },
      });
    });

    it('loga aviso mas ainda marca notified_at quando o OneSignal responde com erro', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const client = clientWith();
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([{ id: 'm1', title: 'Estudo', congregation_id: 'g1' }]);
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
      const { service } = serviceWith(client, { system });

      await service.publishPending();

      expect(system.studyMaterial.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { notified_at: expect.any(Date) },
      });
    });

    it('captura exceção de rede e não marca notified_at para aquele material', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const client = clientWith();
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([{ id: 'm1', title: 'Estudo', congregation_id: 'g1' }]);
      fetchMock.mockRejectedValue(new Error('rede fora'));
      const { service } = serviceWith(client, { system });

      await expect(service.publishPending()).resolves.toBeUndefined();
      expect(system.studyMaterial.update).not.toHaveBeenCalled();
    });
  });
});
