import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrayerRequestsService } from './prayer-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['member'],
  plan: 'starter',
};

// O usuário do token é a pessoa `p1`, membro do grupo `sg1`. Cada teste que
// quer o contrário sobrescreve um dos dois mocks — é a fronteira que o
// service defende, então ela é explícita em vez de default silencioso.
function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    userAccount: { findUnique: jest.fn().mockResolvedValue({ person_id: 'p1' }) },
    groupMembership: { findUnique: jest.fn().mockResolvedValue({ role: 'member' }) },
    prayerRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  return new PrayerRequestsService({ client } as unknown as PrismaService);
}

describe('PrayerRequestsService', () => {
  describe('participação é a autoridade', () => {
    it.each([
      ['create', (s: PrayerRequestsService) => s.create('sg1', { content: 'orem por mim' }, USER)],
      ['findByGroup', (s: PrayerRequestsService) => s.findByGroup('sg1', USER)],
      ['remove', (s: PrayerRequestsService) => s.remove('sg1', 'pr1', USER)],
    ])('%s nega quem não tem GroupMembership no grupo', async (_name, call) => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(call(service)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.prayerRequest.create).not.toHaveBeenCalled();
      expect(client.prayerRequest.findMany).not.toHaveBeenCalled();
      expect(client.prayerRequest.delete).not.toHaveBeenCalled();
    });

    it('nega quando o papel do JWT é alto mas não há participação — pastor não lê célula alheia', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.findByGroup('sg1', { ...USER, roles: ['pastor', 'tenant_admin'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lança NotFoundException quando a conta não tem pessoa vinculada', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const service = serviceWith(client);

      await expect(service.findByGroup('sg1', USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('grava o pedido com tenant, congregação, grupo e a pessoa do token', async () => {
      const client = clientWith();
      client.prayerRequest.create.mockResolvedValue({ id: 'pr1' });
      const service = serviceWith(client);

      const result = await service.create('sg1', { content: 'orem pela minha mãe' }, USER);

      expect(client.prayerRequest.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          small_group_id: 'sg1',
          person_id: 'p1',
          content: 'orem pela minha mãe',
          is_anonymous: false,
        },
      });
      expect(result).toEqual({ id: 'pr1' });
    });

    it('respeita is_anonymous quando pedido, e grava a pessoa mesmo assim', async () => {
      const client = clientWith();
      client.prayerRequest.create.mockResolvedValue({ id: 'pr2' });
      const service = serviceWith(client);

      await service.create('sg1', { content: 'assunto delicado', is_anonymous: true }, USER);

      expect(client.prayerRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ is_anonymous: true, person_id: 'p1' }),
      });
    });
  });

  describe('findByGroup', () => {
    const rows = [
      {
        id: 'pr1',
        content: 'meu pedido',
        is_anonymous: true,
        created_at: new Date('2026-09-12'),
        person_id: 'p1',
        person: { id: 'p1', full_name: 'Ana' },
      },
      {
        id: 'pr2',
        content: 'pedido de outro, anônimo',
        is_anonymous: true,
        created_at: new Date('2026-09-11'),
        person_id: 'p2',
        person: { id: 'p2', full_name: 'Bruno' },
      },
      {
        id: 'pr3',
        content: 'pedido de outro, assinado',
        is_anonymous: false,
        created_at: new Date('2026-09-10'),
        person_id: 'p2',
        person: { id: 'p2', full_name: 'Bruno' },
      },
    ];

    it('esconde o autor do pedido anônimo alheio, preserva o próprio e o assinado', async () => {
      const client = clientWith();
      client.prayerRequest.findMany.mockResolvedValue(rows);
      const service = serviceWith(client);

      const result = await service.findByGroup('sg1', USER);

      expect(result).toEqual([
        expect.objectContaining({ id: 'pr1', person: { id: 'p1', full_name: 'Ana' }, is_mine: true }),
        expect.objectContaining({ id: 'pr2', person: null, is_mine: false }),
        expect.objectContaining({
          id: 'pr3',
          person: { id: 'p2', full_name: 'Bruno' },
          is_mine: false,
        }),
      ]);
    });

    it('membro comum só pode apagar o próprio pedido — can_delete acompanha', async () => {
      const client = clientWith();
      client.prayerRequest.findMany.mockResolvedValue(rows);
      const service = serviceWith(client);

      const result = await service.findByGroup('sg1', USER);

      expect(result.map((r) => r.can_delete)).toEqual([true, false, false]);
    });

    it('líder da célula pode apagar qualquer pedido do grupo', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue({ role: 'leader' });
      client.prayerRequest.findMany.mockResolvedValue(rows);
      const service = serviceWith(client);

      const result = await service.findByGroup('sg1', USER);

      expect(result.map((r) => r.can_delete)).toEqual([true, true, true]);
    });

    it('anônimo alheio continua sem autor mesmo para o líder — moderar não é identificar', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue({ role: 'leader' });
      client.prayerRequest.findMany.mockResolvedValue(rows);
      const service = serviceWith(client);

      const result = await service.findByGroup('sg1', USER);

      expect(result[1]).toEqual(expect.objectContaining({ id: 'pr2', person: null }));
    });

    it('pede o mais recente primeiro, só do grupo', async () => {
      const client = clientWith();
      client.prayerRequest.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      await service.findByGroup('sg1', USER);

      expect(client.prayerRequest.findMany).toHaveBeenCalledWith({
        where: { small_group_id: 'sg1' },
        orderBy: { created_at: 'desc' },
        include: { person: { select: { id: true, full_name: true } } },
      });
    });
  });

  describe('remove', () => {
    it('deixa o autor apagar o próprio pedido', async () => {
      const client = clientWith();
      client.prayerRequest.findFirst.mockResolvedValue({ id: 'pr1', person_id: 'p1' });
      const service = serviceWith(client);

      const result = await service.remove('sg1', 'pr1', USER);

      expect(client.prayerRequest.delete).toHaveBeenCalledWith({ where: { id: 'pr1' } });
      expect(result).toEqual({ id: 'pr1' });
    });

    it('deixa o líder do grupo apagar pedido alheio', async () => {
      const client = clientWith();
      client.prayerRequest.findFirst.mockResolvedValue({ id: 'pr1', person_id: 'p2' });
      client.groupMembership.findUnique.mockResolvedValue({ role: 'leader' });
      const service = serviceWith(client);

      await service.remove('sg1', 'pr1', USER);

      expect(client.prayerRequest.delete).toHaveBeenCalledWith({ where: { id: 'pr1' } });
    });

    it('nega membro comum apagando pedido alheio', async () => {
      const client = clientWith();
      client.prayerRequest.findFirst.mockResolvedValue({ id: 'pr1', person_id: 'p2' });
      const service = serviceWith(client);

      await expect(service.remove('sg1', 'pr1', USER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.prayerRequest.delete).not.toHaveBeenCalled();
    });

    it('nega trainee apagando pedido alheio — só `leader` modera', async () => {
      const client = clientWith();
      client.prayerRequest.findFirst.mockResolvedValue({ id: 'pr1', person_id: 'p2' });
      client.groupMembership.findUnique.mockResolvedValue({ role: 'trainee' });
      const service = serviceWith(client);

      await expect(service.remove('sg1', 'pr1', USER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(client.prayerRequest.delete).not.toHaveBeenCalled();
    });

    it('404 quando o pedido não é daquele grupo', async () => {
      const client = clientWith();
      client.prayerRequest.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('sg1', 'pr9', USER)).rejects.toBeInstanceOf(NotFoundException);
      expect(client.prayerRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'pr9', small_group_id: 'sg1' },
        select: { id: true, person_id: true },
      });
    });
  });
});
