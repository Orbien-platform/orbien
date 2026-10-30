import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StudyMaterialsService } from './study-materials.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../content/notifications.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['secretary'],
  plan: 'premium',
};

const EXISTING_MATERIAL = {
  id: 'm1',
  tenant_id: 't1',
  congregation_id: 'g1',
  title: 'Título antigo',
  description: null,
  author: null,
  source_type: 'rich_text',
  file_url: null,
  rich_content: 'conteúdo antigo',
  publish_at: new Date('2026-09-01T00:00:00.000Z'),
  expires_at: null,
  tags: ['fé'],
  audience: 'all_networks',
  network_id: null,
  version: 1,
};

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    smallGroup: { findMany: jest.fn() },
    network: { findFirst: jest.fn() },
    studyMaterial: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    materialTarget: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
    groupMembership: { findMany: jest.fn() },
    userAccount: { findUnique: jest.fn() },
    materialOpenRecord: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
    studyMaterialVersion: { create: jest.fn(), findMany: jest.fn() },
    ...overrides,
  };
}

function systemWith(overrides: Record<string, unknown> = {}) {
  return {
    studyMaterial: { findMany: jest.fn(), update: jest.fn() },
    groupMembership: { findMany: jest.fn().mockResolvedValue([]) },
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
  const notifications = { sendPushToPersons: jest.fn().mockResolvedValue(true) };
  return {
    service: new StudyMaterialsService(
      prisma,
      storageService,
      notifications as unknown as NotificationsService,
    ),
    storageService,
    system,
    notifications,
  };
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

    it('recusa arquivo sem extensão de PDF/Word, sem tocar no storage', async () => {
      const client = clientWith();
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
      client.studyMaterial.create.mockResolvedValue({ id: 'm1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);
      const file = { originalname: 'semext', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

      await expect(
        service.create({ source_type: 'pdf', publish_at: '2026-09-10' } as never, file, USER),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(storageService.upload).not.toHaveBeenCalled();
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

  describe('create — alcance', () => {
    function ready() {
      const client = clientWith();
      client.studyMaterial.create.mockResolvedValue({ id: 'm1' });
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      return client;
    }
    const base = { title: 'T', source_type: 'rich_text', rich_content: 'x', publish_at: '2026-09-10' };

    it('rede: alcança os PGs da rede, grava audience/network_id e visibility', async () => {
      const client = ready();
      client.network.findFirst.mockResolvedValue({ id: 'n1' });
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
      const { service } = serviceWith(client);

      await service.create(
        { ...base, audience: 'network', network_id: 'n1', visibility: 'leaders_only' } as never,
        undefined,
        USER,
      );

      expect(client.network.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'n1', congregation_id: 'g1' } }),
      );
      expect(client.smallGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { network_id: 'n1', congregation_id: 'g1' } }),
      );
      expect(client.studyMaterial.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ audience: 'network', network_id: 'n1', visibility: 'leaders_only' }),
      });
      expect(client.materialTarget.createMany).toHaveBeenCalledWith({
        data: [
          { study_material_id: 'm1', small_group_id: 'g1' },
          { study_material_id: 'm1', small_group_id: 'g2' },
        ],
        skipDuplicates: true,
      });
    });

    it('rede de outra congregação é recusada', async () => {
      const client = ready();
      client.network.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(
        service.create({ ...base, audience: 'network', network_id: 'n9' } as never, undefined, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.studyMaterial.create).not.toHaveBeenCalled();
    });

    it('todas as redes: alcança todos os PGs da congregação', async () => {
      const client = ready();
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }]);
      const { service } = serviceWith(client);

      await service.create({ ...base, audience: 'all_networks' } as never, undefined, USER);

      expect(client.smallGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { congregation_id: 'g1' } }),
      );
      expect(client.studyMaterial.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ audience: 'all_networks', network_id: null, visibility: 'all' }),
      });
      expect(client.materialTarget.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ small_group_id: 'g3' })]) }),
      );
    });

    it('alcance inválido é recusado antes de subir o arquivo ao storage', async () => {
      const client = ready();
      client.network.findFirst.mockResolvedValue(null);
      const { service, storageService } = serviceWith(client);
      const file = { originalname: 'a.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

      await expect(
        service.create({ title: 'T', source_type: 'pdf', publish_at: '2026-09-10', audience: 'network', network_id: 'n9' } as never, file, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it('falha ao gravar remove o arquivo do bucket', async () => {
      const client = ready();
      client.smallGroup.findMany.mockResolvedValue([{ id: 'g1' }]);
      client.studyMaterial.create.mockRejectedValue(new Error('db'));
      const { service, storageService } = serviceWith(client);
      const file = { originalname: 'a.pdf', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

      await expect(
        service.create({ title: 'T', source_type: 'pdf', publish_at: '2026-09-10' } as never, file, USER),
      ).rejects.toThrow('db');
      expect(storageService.deleteByUrl).toHaveBeenCalledWith('https://cdn/materiais/a.pdf');
    });

    it('PG específico sem nenhum PG informado é recusado', async () => {
      const client = ready();
      const { service } = serviceWith(client);

      await expect(
        service.create({ ...base, audience: 'group' } as never, undefined, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('traz o primeiro PG alvo de cada material, para o rótulo da lista', async () => {
      const client = clientWith();
      client.studyMaterial.findMany.mockResolvedValue([]);
      client.studyMaterial.count.mockResolvedValue(0);
      const { service } = serviceWith(client);

      await service.findAll({ page: 1, limit: 20 } as never);

      expect(client.studyMaterial.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            materialTargets: { take: 1, include: { smallGroup: { select: { id: true, name: true } } } },
          }),
        }),
      );
    });

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
      client.studyMaterial.findUnique.mockResolvedValue(EXISTING_MATERIAL);
      client.studyMaterial.updateMany.mockResolvedValue({ count: 1 });
      client.studyMaterial.findUniqueOrThrow.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);

      await service.update('m1', { title: 'Novo' } as never, undefined, USER);

      expect(storageService.deleteByUrl).not.toHaveBeenCalled();
      expect(client.studyMaterial.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', version: 1 },
        data: { title: 'Novo', version: { increment: 1 } },
      });
      expect(client.studyMaterial.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'm1' },
        include: { materialTargets: { include: { smallGroup: true } } },
      });
      expect(client.materialTarget.deleteMany).not.toHaveBeenCalled();
    });

    describe('alcance', () => {
      function setup() {
        const client = clientWith();
        client.studyMaterial.findUnique.mockResolvedValue(EXISTING_MATERIAL);
        client.studyMaterial.updateMany.mockResolvedValue({ count: 1 });
        client.studyMaterial.findUniqueOrThrow.mockResolvedValue({ id: 'm1' });
        return { client, ...serviceWith(client) };
      }

      it('troca para uma rede: regrava os PGs dela e a coluna network_id', async () => {
        const { client, service } = setup();
        client.network.findFirst.mockResolvedValue({ id: 'n1' });
        client.smallGroup.findMany.mockResolvedValue([{ id: 'sg1' }, { id: 'sg2' }]);

        await service.update('m1', { audience: 'network', network_id: 'n1' } as never, undefined, USER);

        expect(client.studyMaterial.updateMany).toHaveBeenCalledWith({
          where: { id: 'm1', version: 1 },
          data: {
            audience: 'network',
            network_id: 'n1',
            version: { increment: 1 },
          },
        });
        expect(client.materialTarget.deleteMany).toHaveBeenCalledWith({
          where: { study_material_id: 'm1' },
        });
        expect(client.materialTarget.createMany).toHaveBeenCalledWith({
          data: [
            { study_material_id: 'm1', small_group_id: 'sg1' },
            { study_material_id: 'm1', small_group_id: 'sg2' },
          ],
          skipDuplicates: true,
        });
      });

      it('só target_group_ids vira audience group e não vaza o campo para o Prisma', async () => {
        const { client, service } = setup();
        client.smallGroup.findMany.mockResolvedValue([{ id: 'sg1' }]);

        await service.update('m1', { target_group_ids: ['sg1'] } as never, undefined, USER);

        const { data } = client.studyMaterial.updateMany.mock.calls[0][0];
        expect(data).toEqual({ audience: 'group', network_id: null, version: { increment: 1 } });
        expect(client.materialTarget.createMany).toHaveBeenCalledWith({
          data: [{ study_material_id: 'm1', small_group_id: 'sg1' }],
          skipDuplicates: true,
        });
      });

      it('troca só a visibilidade sem mexer nos PGs alcançados', async () => {
        const { client, service } = setup();

        await service.update('m1', { visibility: 'leaders_only' } as never, undefined, USER);

        expect(client.studyMaterial.updateMany).toHaveBeenCalledWith({
          where: { id: 'm1', version: 1 },
          data: { visibility: 'leaders_only', version: { increment: 1 } },
        });
        expect(client.materialTarget.deleteMany).not.toHaveBeenCalled();
      });

      it('recusa PG de outra congregação antes de gravar qualquer coisa', async () => {
        const { client, service } = setup();
        client.smallGroup.findMany.mockResolvedValue([]);

        await expect(
          service.update('m1', { audience: 'group', target_group_ids: ['sg9'] } as never, undefined, USER),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(client.studyMaterial.updateMany).not.toHaveBeenCalled();
        expect(client.materialTarget.deleteMany).not.toHaveBeenCalled();
      });

      it('só network_id num material de rede mantém a audience e troca a rede', async () => {
        const { client, service } = setup();
        client.studyMaterial.findUnique.mockResolvedValue({
          ...EXISTING_MATERIAL,
          audience: 'network',
          network_id: 'n1',
        });
        client.network.findFirst.mockResolvedValue({ id: 'n2' });
        client.smallGroup.findMany.mockResolvedValue([{ id: 'sg3' }]);

        await service.update('m1', { network_id: 'n2' } as never, undefined, USER);

        const { data } = client.studyMaterial.updateMany.mock.calls[0][0];
        expect(data).toMatchObject({ audience: 'network', network_id: 'n2' });
      });

      it('rede sem PGs apaga os alvos e não grava nenhum', async () => {
        const { client, service } = setup();
        client.network.findFirst.mockResolvedValue({ id: 'n1' });
        client.smallGroup.findMany.mockResolvedValue([]);

        await service.update('m1', { audience: 'network', network_id: 'n1' } as never, undefined, USER);

        expect(client.materialTarget.deleteMany).toHaveBeenCalled();
        expect(client.materialTarget.createMany).not.toHaveBeenCalled();
      });

      it('alcance para todas as redes zera o network_id que existia', async () => {
        const { client, service } = setup();
        client.studyMaterial.findUnique.mockResolvedValue({
          ...EXISTING_MATERIAL,
          audience: 'network',
          network_id: 'n1',
        });
        client.smallGroup.findMany.mockResolvedValue([{ id: 'sg1' }]);

        await service.update('m1', { audience: 'all_networks' } as never, undefined, USER);

        const { data } = client.studyMaterial.updateMany.mock.calls[0][0];
        expect(data.audience).toBe('all_networks');
        expect(data.network_id).toBeNull();
      });
    });

    it('lança ConflictException quando o material foi alterado por outra pessoa nesse meio tempo', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue(EXISTING_MATERIAL);
      client.studyMaterial.updateMany.mockResolvedValue({ count: 0 });
      const { service } = serviceWith(client);

      await expect(service.update('m1', { title: 'Novo' } as never, undefined, USER)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(client.studyMaterialVersion.create).not.toHaveBeenCalled();
    });

    it('grava um snapshot da versão anterior depois de aplicar o update', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue(EXISTING_MATERIAL);
      client.studyMaterial.updateMany.mockResolvedValue({ count: 1 });
      client.studyMaterial.findUniqueOrThrow.mockResolvedValue({ id: 'm1' });
      const { service } = serviceWith(client);

      await service.update('m1', { title: 'Novo' } as never, undefined, USER);

      expect(client.studyMaterialVersion.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          study_material_id: 'm1',
          version: 1,
          title: 'Título antigo',
          description: null,
          author: null,
          source_type: 'rich_text',
          file_url: null,
          rich_content: 'conteúdo antigo',
          publish_at: EXISTING_MATERIAL.publish_at,
          expires_at: null,
          tags: ['fé'],
          changed_by_user_id: 'u1',
        },
      });
    });

    it('substitui o arquivo, enviando o novo e mantendo o antigo para o histórico', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ ...EXISTING_MATERIAL, file_url: 'https://cdn/old.pdf' });
      client.studyMaterial.updateMany.mockResolvedValue({ count: 1 });
      client.studyMaterial.findUniqueOrThrow.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);
      const file = { originalname: 'novo.PDF', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

      await service.update('m1', {} as never, file, USER);

      expect(storageService.deleteByUrl).not.toHaveBeenCalled();
      expect(storageService.upload).toHaveBeenCalledWith(file.buffer, expect.stringContaining('.pdf'), 'application/pdf');
      expect(client.studyMaterial.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', version: 1 },
        data: { file_url: 'https://cdn/materiais/a.pdf', source_type: 'pdf', version: { increment: 1 } },
      });
    });

    it('recusa o novo arquivo sem extensão de PDF/Word, sem tocar no storage', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ ...EXISTING_MATERIAL, file_url: null });
      client.studyMaterial.updateMany.mockResolvedValue({ count: 1 });
      client.studyMaterial.findUniqueOrThrow.mockResolvedValue({ id: 'm1' });
      const { service, storageService } = serviceWith(client);
      const file = { originalname: 'semext', buffer: Buffer.from('x'), mimetype: 'application/pdf' } as Express.Multer.File;

      await expect(service.update('m1', {} as never, file, USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(storageService.upload).not.toHaveBeenCalled();
      expect(storageService.deleteByUrl).not.toHaveBeenCalled();
    });

    it('troca o tipo para doc quando o arquivo novo é Word', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ ...EXISTING_MATERIAL, source_type: 'pdf', file_url: 'https://cdn/old.pdf' });
      client.studyMaterial.updateMany.mockResolvedValue({ count: 1 });
      client.studyMaterial.findUniqueOrThrow.mockResolvedValue({ id: 'm1' });
      const { service } = serviceWith(client);
      const file = {
        originalname: 'novo.docx',
        buffer: Buffer.from('x'),
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      } as Express.Multer.File;

      await service.update('m1', {} as never, file, USER);

      expect(client.studyMaterial.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ source_type: 'doc' }) }),
      );
    });

    it('converte publish_at e expires_at quando informados', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ ...EXISTING_MATERIAL, file_url: null });
      client.studyMaterial.updateMany.mockResolvedValue({ count: 1 });
      client.studyMaterial.findUniqueOrThrow.mockResolvedValue({ id: 'm1' });
      const { service } = serviceWith(client);

      await service.update(
        'm1',
        { publish_at: '2026-09-10T00:00:00.000Z', expires_at: '2026-12-01T00:00:00.000Z' } as never,
        undefined,
        USER,
      );

      expect(client.studyMaterial.updateMany).toHaveBeenCalledWith({
        where: { id: 'm1', version: 1 },
        data: expect.objectContaining({
          publish_at: new Date('2026-09-10T00:00:00.000Z'),
          expires_at: new Date('2026-12-01T00:00:00.000Z'),
          version: { increment: 1 },
        }),
      });
    });
  });

  describe('getVersions', () => {
    it('lança NotFoundException quando o material não existe', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.getVersions('m1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lista as versões do material, mais recente primeiro, com quem alterou', async () => {
      const client = clientWith();
      client.studyMaterial.findUnique.mockResolvedValue({ id: 'm1' });
      client.studyMaterialVersion.findMany.mockResolvedValue([
        { id: 'v2', version: 2, changedBy: { id: 'u1', email: 'a@a.com' } },
        { id: 'v1', version: 1, changedBy: { id: 'u1', email: 'a@a.com' } },
      ]);
      const { service } = serviceWith(client);

      const result = await service.getVersions('m1');

      expect(client.studyMaterialVersion.findMany).toHaveBeenCalledWith({
        where: { study_material_id: 'm1' },
        orderBy: { version: 'desc' },
        include: { changedBy: { select: { id: true, email: true } } },
      });
      expect(result.map((v) => v.version)).toEqual([2, 1]);
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

    const pendingMaterial = (over: Record<string, unknown> = {}) => ({
      id: 'm1',
      title: 'Estudo',
      tenant_id: 't1',
      congregation_id: 'g1',
      visibility: 'all',
      materialTargets: [{ small_group_id: 'sg1' }, { small_group_id: 'sg2' }],
      ...over,
    });

    it('avisa só as pessoas dos PGs-alvo e marca notified_at', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([pendingMaterial()]);
      system.groupMembership.findMany.mockResolvedValue([{ person_id: 'p1' }, { person_id: 'p2' }]);
      const { service, notifications } = serviceWith(clientWith(), { system });

      await service.publishPending();

      expect(system.groupMembership.findMany).toHaveBeenCalledWith({
        where: { small_group_id: { in: ['sg1', 'sg2'] } },
        select: { person_id: true },
        distinct: ['person_id'],
      });
      expect(notifications.sendPushToPersons).toHaveBeenCalledTimes(1);
      const [opts, personIds] = notifications.sendPushToPersons.mock.calls[0];
      expect(opts).toMatchObject({ tenantId: 't1', congregationId: 'g1', title: 'Novo material disponível' });
      expect(personIds).toEqual(['p1', 'p2']);
      expect(system.studyMaterial.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { notified_at: expect.any(Date) },
      });
    });

    it('só pega material publicado nas últimas 24h e ainda não avisado', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([]);
      const { service } = serviceWith(clientWith(), { system });

      await service.publishPending();

      const where = system.studyMaterial.findMany.mock.calls[0][0].where;
      expect(where.notified_at).toBeNull();
      expect(where.publish_at.lte.getTime() - where.publish_at.gte.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it('leaders_only: restringe o público a leader e trainee', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([pendingMaterial({ visibility: 'leaders_only' })]);
      const { service } = serviceWith(clientWith(), { system });

      await service.publishPending();

      expect(system.groupMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { small_group_id: { in: ['sg1', 'sg2'] }, role: { in: ['leader', 'trainee'] } },
        }),
      );
    });

    it('material sem PG alvo não dispara push e fica marcado como avisado', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([pendingMaterial({ materialTargets: [] })]);
      const { service, notifications } = serviceWith(clientWith(), { system });

      await service.publishPending();

      expect(system.groupMembership.findMany).not.toHaveBeenCalled();
      expect(notifications.sendPushToPersons).not.toHaveBeenCalled();
      expect(system.studyMaterial.update).toHaveBeenCalled();
    });

    it('OneSignal recusando o envio não marca notified_at (o job tenta de novo na janela)', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([pendingMaterial()]);
      system.groupMembership.findMany.mockResolvedValue([{ person_id: 'p1' }]);
      const { service, notifications } = serviceWith(clientWith(), { system });
      notifications.sendPushToPersons.mockResolvedValue(false);

      await service.publishPending();

      expect(system.studyMaterial.update).not.toHaveBeenCalled();
    });

    it('exceção no push não derruba o job nem marca notified_at', async () => {
      process.env['ONESIGNAL_APP_ID'] = 'app1';
      const system = systemWith();
      system.studyMaterial.findMany.mockResolvedValue([pendingMaterial()]);
      system.groupMembership.findMany.mockResolvedValue([{ person_id: 'p1' }]);
      const { service, notifications } = serviceWith(clientWith(), { system });
      notifications.sendPushToPersons.mockRejectedValue(new Error('rede fora'));

      await expect(service.publishPending()).resolves.toBeUndefined();
      expect(system.studyMaterial.update).not.toHaveBeenCalled();
    });
  });
});
