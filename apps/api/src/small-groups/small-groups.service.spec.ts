import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SmallGroupsService, classifyHealth } from './small-groups.service';
import { PrismaService } from '../prisma/prisma.service';
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
    userAccount: { findUnique: jest.fn() },
    smallGroup: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    groupType: { findUnique: jest.fn() },
    groupMembership: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    groupMeeting: { findMany: jest.fn(), aggregate: jest.fn(), groupBy: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
    smallGroupVisitRequest: { findMany: jest.fn() },
    person: { findUnique: jest.fn() },
    roleAssignment: { findFirst: jest.fn() },
    network: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, runInTx?: jest.Mock) {
  const prisma = {
    client,
    runInTx: runInTx ?? jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  return new SmallGroupsService(prisma);
}

describe('classifyHealth', () => {
  const NOW = new Date('2026-09-15T12:00:00.000Z');

  it('CEL20-04/05: null (nunca se reuniu) é red', () => {
    expect(classifyHealth(null, NOW)).toBe('red');
  });

  it('fronteira 13/14 dias: 13 dias é green, 14 dias é yellow', () => {
    const treze = new Date(NOW.getTime() - 13 * 24 * 60 * 60 * 1000);
    const catorze = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000);

    expect(classifyHealth(treze, NOW)).toBe('green');
    expect(classifyHealth(catorze, NOW)).toBe('yellow');
  });

  it('fronteira 27/28 dias: 27 dias é yellow, 28 dias é red', () => {
    const vinteSete = new Date(NOW.getTime() - 27 * 24 * 60 * 60 * 1000);
    const vinteOito = new Date(NOW.getTime() - 28 * 24 * 60 * 60 * 1000);

    expect(classifyHealth(vinteSete, NOW)).toBe('yellow');
    expect(classifyHealth(vinteOito, NOW)).toBe('red');
  });
});

describe('SmallGroupsService', () => {
  describe('create', () => {
    it('lança NotFoundException quando o grupo pai informado não existe', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create({ parent_group_id: 'nope', group_type_id: 'gt1' } as never, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando o tipo de grupo não existe', async () => {
      const client = clientWith();
      client.groupType.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.create({ group_type_id: 'gt1', leader_person_id: 'p1' } as never, USER),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('cria o grupo filho quando o grupo pai informado existe', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'parent-1' });
      client.groupType.findUnique.mockResolvedValue({ id: 'gt1' });
      client.smallGroup.create.mockResolvedValue({ id: 'sg-child' });
      const service = serviceWith(client);

      const dto = { group_type_id: 'gt1', leader_person_id: 'p1', parent_group_id: 'parent-1' };
      const result = await service.create(dto as never, USER);

      expect(client.smallGroup.findUnique).toHaveBeenCalledWith({
        where: { id: 'parent-1' },
        select: { id: true },
      });
      expect(result).toEqual({ id: 'sg-child' });
    });

    it('cria o grupo e a membership de líder na mesma transação', async () => {
      const client = clientWith();
      client.groupType.findUnique.mockResolvedValue({ id: 'gt1' });
      client.smallGroup.create.mockResolvedValue({ id: 'sg1' });
      client.groupMembership.create.mockResolvedValue({ id: 'mem1' });
      const service = serviceWith(client);

      const dto = { group_type_id: 'gt1', leader_person_id: 'p1', name: 'Célula' };
      const result = await service.create(dto as never, USER);

      expect(client.smallGroup.create).toHaveBeenCalledWith({
        data: { ...dto, is_public: false, tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(client.groupMembership.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 't1',
          congregation_id: 'g1',
          small_group_id: 'sg1',
          person_id: 'p1',
          role: 'leader',
        },
      });
      expect(result).toEqual({ id: 'sg1' });
    });

    it('respeita is_public quando informado explicitamente', async () => {
      const client = clientWith();
      client.groupType.findUnique.mockResolvedValue({ id: 'gt1' });
      client.smallGroup.create.mockResolvedValue({ id: 'sg1' });
      const service = serviceWith(client);

      await service.create(
        { group_type_id: 'gt1', leader_person_id: 'p1', is_public: true } as never,
        USER,
      );

      expect(client.smallGroup.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ is_public: true }) }),
      );
    });
  });

  describe('multiply', () => {
    const MOTHER = {
      id: 'mother-1',
      tenant_id: 't1',
      congregation_id: 'g1',
      group_type_id: 'gt1',
      leader_person_id: 'old-leader',
    };
    const DTO = {
      name: 'Célula Bairro A',
      leader_person_id: 'new-leader',
      member_ids: ['p1', 'p2'],
    };
    const CELL_LEADER_USER: JwtPayload = {
      sub: 'u2',
      tenant_id: 't1',
      congregation_id: 'g1',
      roles: ['cell_leader'],
      plan: 'starter',
    };
    const MANAGER_USER: JwtPayload = {
      sub: 'u3',
      tenant_id: 't1',
      congregation_id: 'g1',
      roles: ['pastor'],
      plan: 'starter',
    };

    it('lança NotFoundException quando a célula mãe não existe', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.multiply('mother-1', DTO as never, USER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('AC1: cria a célula filha, move os membros e promove o novo líder, numa transação', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 't1' });
      client.groupMembership.count.mockResolvedValue(2);
      client.smallGroup.create.mockResolvedValue({ id: 'child-1' });
      const service = serviceWith(client);

      const result = await service.multiply('mother-1', DTO as never, MANAGER_USER);

      expect(client.smallGroup.create).toHaveBeenCalledWith({
        data: {
          name: 'Célula Bairro A',
          group_type_id: 'gt1',
          parent_group_id: 'mother-1',
          tenant_id: 't1',
          congregation_id: 'g1',
          leader_person_id: 'new-leader',
          meeting_time: undefined,
          recurrence: undefined,
          address: undefined,
        },
      });
      expect(client.groupMembership.updateMany).toHaveBeenCalledWith({
        where: { small_group_id: 'mother-1', person_id: { in: ['p1', 'p2'] } },
        data: { small_group_id: 'child-1' },
      });
      expect(client.groupMembership.upsert).toHaveBeenCalledWith({
        where: { small_group_id_person_id: { small_group_id: 'child-1', person_id: 'new-leader' } },
        create: {
          tenant_id: 't1',
          congregation_id: 'g1',
          small_group_id: 'child-1',
          person_id: 'new-leader',
          role: 'leader',
        },
        update: { role: 'leader' },
      });
      expect(result).toEqual({ id: 'child-1' });
    });

    it('AC2: 400 quando leader_person_id não é Person do mesmo tenant, sem abrir transação', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 'outro-tenant' });
      const runInTx = jest.fn();
      const service = serviceWith(client, runInTx);

      await expect(service.multiply('mother-1', DTO as never, MANAGER_USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(runInTx).not.toHaveBeenCalled();
    });

    it('AC2: 400 quando leader_person_id não existe, sem abrir transação', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.person.findUnique.mockResolvedValue(null);
      const runInTx = jest.fn();
      const service = serviceWith(client, runInTx);

      await expect(service.multiply('mother-1', DTO as never, MANAGER_USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(runInTx).not.toHaveBeenCalled();
    });

    it('AC2: 400 quando algum member_id não é membro ativo da mãe, sem criar nada', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 't1' });
      client.groupMembership.count.mockResolvedValue(1); // só 1 dos 2 member_ids pertence à mãe
      const service = serviceWith(client);

      await expect(service.multiply('mother-1', DTO as never, MANAGER_USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(client.smallGroup.create).not.toHaveBeenCalled();
    });

    it('AC3: member_ids vazio é permitido — célula filha nasce só com o líder', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 't1' });
      client.smallGroup.create.mockResolvedValue({ id: 'child-1' });
      const service = serviceWith(client);

      await service.multiply(
        'mother-1',
        { name: 'Filha', leader_person_id: 'new-leader', member_ids: [] } as never,
        MANAGER_USER,
      );

      expect(client.groupMembership.count).not.toHaveBeenCalled();
      expect(client.groupMembership.updateMany).not.toHaveBeenCalled();
      expect(client.groupMembership.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { role: 'leader' } }),
      );
    });

    it('AC4: 403 quando o usuário não tem MANAGE_ROLES nem é líder desta célula', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'outra-pessoa' });
      client.roleAssignment.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.multiply('mother-1', DTO as never, CELL_LEADER_USER),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('permite o cell_leader multiplicar quando é o leader_person_id da própria célula', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'old-leader' });
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 't1' });
      client.groupMembership.count.mockResolvedValue(2);
      client.smallGroup.create.mockResolvedValue({ id: 'child-1' });
      const service = serviceWith(client);

      const result = await service.multiply('mother-1', DTO as never, CELL_LEADER_USER);

      expect(result).toEqual({ id: 'child-1' });
    });

    it('permite o cell_leader multiplicar via RoleAssignment escopado à célula, mesmo sem ser o leader_person_id', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'outra-pessoa' });
      client.roleAssignment.findFirst.mockResolvedValue({ id: 'ra1' });
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 't1' });
      client.groupMembership.count.mockResolvedValue(2);
      client.smallGroup.create.mockResolvedValue({ id: 'child-1' });
      const service = serviceWith(client);

      const result = await service.multiply('mother-1', DTO as never, CELL_LEADER_USER);

      expect(client.roleAssignment.findFirst).toHaveBeenCalledWith({
        where: { user_account_id: 'u2', small_group_id: 'mother-1', role_code: 'cell_leader' },
        select: { id: true },
      });
      expect(result).toEqual({ id: 'child-1' });
    });

    it('edge case: member_ids inclui o próprio líder atual da mãe — ele é movido para a filha', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 't1' });
      client.groupMembership.count.mockResolvedValue(1);
      client.smallGroup.create.mockResolvedValue({ id: 'child-1' });
      const service = serviceWith(client);

      await service.multiply(
        'mother-1',
        { name: 'Filha', leader_person_id: 'new-leader', member_ids: ['old-leader'] } as never,
        MANAGER_USER,
      );

      expect(client.groupMembership.updateMany).toHaveBeenCalledWith({
        where: { small_group_id: 'mother-1', person_id: { in: ['old-leader'] } },
        data: { small_group_id: 'child-1' },
      });
    });

    it('edge case: leader_person_id da nova célula já lidera outra célula — permitido sem checagem extra', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 't1' });
      client.groupMembership.count.mockResolvedValue(2);
      client.smallGroup.create.mockResolvedValue({ id: 'child-1' });
      const service = serviceWith(client);

      await expect(service.multiply('mother-1', DTO as never, MANAGER_USER)).resolves.toEqual({
        id: 'child-1',
      });
    });

    it('edge case: corrida entre duas multiplicações movendo o mesmo person_id — a segunda falha com 400', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(MOTHER);
      client.person.findUnique.mockResolvedValue({ id: 'new-leader', tenant_id: 't1' });
      // A primeira chamada já moveu 'p1' para outra filha: a recontagem da
      // segunda não encontra mais os 2 member_ids na mãe.
      client.groupMembership.count.mockResolvedValue(1);
      const service = serviceWith(client);

      await expect(service.multiply('mother-1', DTO as never, MANAGER_USER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(client.smallGroup.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('aplica os filtros informados e pagina os resultados', async () => {
      const client = clientWith();
      client.smallGroup.findMany.mockResolvedValue([{ id: 'sg1' }]);
      client.smallGroup.count.mockResolvedValue(1);
      const service = serviceWith(client);

      const result = await service.findAll({
        group_type_id: 'gt1',
        is_public: true,
        search: 'Célula',
        page: 2,
        limit: 10,
      } as never);

      expect(client.smallGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { group_type_id: 'gt1', is_public: true, name: { contains: 'Célula', mode: 'insensitive' } },
          skip: 10,
          take: 10,
        }),
      );
      expect(result).toEqual({ data: [{ id: 'sg1' }], total: 1, page: 2, limit: 10 });
    });

    it('não filtra por is_public quando não informado', async () => {
      const client = clientWith();
      client.smallGroup.findMany.mockResolvedValue([]);
      client.smallGroup.count.mockResolvedValue(0);
      const service = serviceWith(client);

      await service.findAll({ page: 1, limit: 20 } as never);

      expect(client.smallGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findOne', () => {
    it('retorna o grupo quando encontrado', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'sg1' });
      const service = serviceWith(client);

      expect(await service.findOne('sg1')).toEqual({ id: 'sg1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.findOne('sg1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando o grupo não existe', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.update('sg1', {} as never, USER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('atualiza sem trocar de transação quando o líder não muda', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'sg1', leader_person_id: 'p1' });
      client.smallGroup.update.mockResolvedValue({ id: 'sg1' });
      const runInTx = jest.fn();
      const service = serviceWith(client, runInTx);

      await service.update('sg1', { leader_person_id: 'p1', name: 'Novo nome' } as never, USER);

      expect(runInTx).not.toHaveBeenCalled();
      expect(client.smallGroup.update).toHaveBeenCalledWith({
        where: { id: 'sg1' },
        data: { leader_person_id: 'p1', name: 'Novo nome' },
      });
    });

    it('atualiza sem trocar de transação quando leader_person_id não é informado', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'sg1', leader_person_id: 'p1' });
      client.smallGroup.update.mockResolvedValue({ id: 'sg1' });
      const runInTx = jest.fn();
      const service = serviceWith(client, runInTx);

      await service.update('sg1', { name: 'Novo nome' } as never, USER);

      expect(runInTx).not.toHaveBeenCalled();
    });

    it('troca o líder: rebaixa o antigo e promove o novo dentro da transação', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'sg1', leader_person_id: 'old-leader' });
      client.smallGroup.update.mockResolvedValue({ id: 'sg1' });
      const service = serviceWith(client);

      await service.update('sg1', { leader_person_id: 'new-leader' } as never, USER);

      expect(client.groupMembership.updateMany).toHaveBeenCalledWith({
        where: { small_group_id: 'sg1', person_id: 'old-leader' },
        data: { role: 'member' },
      });
      expect(client.groupMembership.upsert).toHaveBeenCalledWith({
        where: { small_group_id_person_id: { small_group_id: 'sg1', person_id: 'new-leader' } },
        create: {
          tenant_id: 't1',
          congregation_id: 'g1',
          small_group_id: 'sg1',
          person_id: 'new-leader',
          role: 'leader',
        },
        update: { role: 'leader' },
      });
    });

    // Vínculo de rede (PROD-20, CEL20-07/AC7)
    it('vincula a célula a uma rede da mesma congregação', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({
        id: 'sg1',
        leader_person_id: 'p1',
        congregation_id: 'g1',
      });
      client.network.findUnique.mockResolvedValue({ congregation_id: 'g1' });
      client.smallGroup.update.mockResolvedValue({ id: 'sg1', network_id: 'net1' });
      const service = serviceWith(client);

      const result = await service.update(
        'sg1',
        { network_id: 'net1' } as never,
        USER,
      );

      expect(client.network.findUnique).toHaveBeenCalledWith({
        where: { id: 'net1' },
        select: { congregation_id: true },
      });
      expect(result).toEqual({ id: 'sg1', network_id: 'net1' });
    });

    it('rejeita vincular a uma rede de outra congregação (AC7 — 400)', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({
        id: 'sg1',
        leader_person_id: 'p1',
        congregation_id: 'g1',
      });
      client.network.findUnique.mockResolvedValue({ congregation_id: 'outra-congregacao' });
      const service = serviceWith(client);

      await expect(
        service.update('sg1', { network_id: 'net1' } as never, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.smallGroup.update).not.toHaveBeenCalled();
    });

    it('rejeita vincular a uma rede inexistente (400)', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({
        id: 'sg1',
        leader_person_id: 'p1',
        congregation_id: 'g1',
      });
      client.network.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.update('sg1', { network_id: 'net1' } as never, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('desvincula a rede (network_id: null) sem validar contra Network', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({
        id: 'sg1',
        leader_person_id: 'p1',
        congregation_id: 'g1',
      });
      client.smallGroup.update.mockResolvedValue({ id: 'sg1', network_id: null });
      const service = serviceWith(client);

      const result = await service.update('sg1', { network_id: null } as never, USER);

      expect(client.network.findUnique).not.toHaveBeenCalled();
      expect(client.smallGroup.update).toHaveBeenCalledWith({
        where: { id: 'sg1' },
        data: { network_id: null },
      });
      expect(result).toEqual({ id: 'sg1', network_id: null });
    });
  });

  describe('remove', () => {
    it('remove o grupo quando encontrado', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ id: 'sg1' });
      client.smallGroup.delete.mockResolvedValue({ id: 'sg1' });
      const service = serviceWith(client);

      expect(await service.remove('sg1')).toEqual({ id: 'sg1' });
    });

    it('lança NotFoundException quando não encontrado', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.remove('sg1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('addMember', () => {
    it('adiciona um novo membro com role default (member)', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue(null);
      client.groupMembership.create.mockResolvedValue({ id: 'mem1', role: 'member' });
      const service = serviceWith(client);

      await service.addMember('sg1', { person_id: 'p1' } as never, USER);

      expect(client.groupMembership.create).toHaveBeenCalledWith({
        data: { tenant_id: 't1', congregation_id: 'g1', small_group_id: 'sg1', person_id: 'p1', role: 'member' },
      });
    });

    it('atualiza a role de um membro existente', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue({ id: 'mem1', role: 'member' });
      client.groupMembership.update.mockResolvedValue({ id: 'mem1', role: 'volunteer' });
      const service = serviceWith(client);

      await service.addMember('sg1', { person_id: 'p1', role: 'volunteer' } as never, USER);

      expect(client.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'mem1' },
        data: { role: 'volunteer' },
      });
    });

    it('rejeita rebaixar o líder atual através deste endpoint', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue({ id: 'mem1', role: 'leader' });
      const service = serviceWith(client);

      await expect(
        service.addMember('sg1', { person_id: 'p1', role: 'member' } as never, USER),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('permite reatribuir o líder para leader novamente sem erro', async () => {
      const client = clientWith();
      client.groupMembership.findUnique.mockResolvedValue({ id: 'mem1', role: 'leader' });
      client.groupMembership.update.mockResolvedValue({ id: 'mem1', role: 'leader' });
      const service = serviceWith(client);

      await service.addMember('sg1', { person_id: 'p1', role: 'leader' } as never, USER);

      expect(client.groupMembership.update).toHaveBeenCalledWith({
        where: { id: 'mem1' },
        data: { role: 'leader' },
      });
    });
  });

  describe('removeMember', () => {
    it('lança NotFoundException quando o grupo não existe', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.removeMember('sg1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita remover o líder do grupo', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ leader_person_id: 'p1' });
      const service = serviceWith(client);

      await expect(service.removeMember('sg1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança NotFoundException quando o membro não está no grupo', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ leader_person_id: 'lider' });
      client.groupMembership.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(service.removeMember('sg1', 'p1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('remove o membro quando encontrado e não é o líder', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ leader_person_id: 'lider' });
      client.groupMembership.findUnique.mockResolvedValue({ id: 'mem1' });
      client.groupMembership.delete.mockResolvedValue({ id: 'mem1' });
      const service = serviceWith(client);

      expect(await service.removeMember('sg1', 'p1')).toEqual({ id: 'mem1' });
    });
  });

  // A CTE recursiva ($queryRaw) em si — descendentes reais contra Postgres —
  // não se testa com mock (docs/TESTES.md, Fase 5); cobertura ponta a ponta
  // fica em test/integration/small-groups-hierarchy.spec.ts. Este describe
  // cobre só a montagem de { ancestors, tree } a partir de linhas já
  // resolvidas (mockadas) — o formato do retorno, não o SQL.
  describe('getHierarchy', () => {
    const row = (id: string, parent: string | null, depth: number) => ({
      id,
      name: `Grupo ${id}`,
      group_type_id: 'gt1',
      group_type_name: 'Célula',
      parent_group_id: parent,
      leader_person_id: 'lider',
      leader_person_name: 'Líder',
      is_public: true,
      meeting_time: null,
      recurrence: null,
      depth,
    });

    it('retorna ancestors: [] e tree: null quando o grupo raiz não está no resultado', async () => {
      const client = clientWith();
      client.$queryRaw.mockResolvedValue([]);
      const service = serviceWith(client);

      expect(await service.getHierarchy('sg1')).toEqual({ ancestors: [], tree: null });
    });

    it('monta a árvore com filhos aninhados e generation por nível, célula raiz sem ancestrais', async () => {
      const client = clientWith();
      client.$queryRaw.mockResolvedValue([
        row('sg1', null, 1),
        row('sg2', 'sg1', 2),
        row('sg3', 'sg1', 2),
        row('sg4', 'sg2', 3),
      ]);
      client.smallGroup.findUnique.mockResolvedValue({ parent_group_id: null }); // sg1 é raiz
      client.groupMeeting.groupBy.mockResolvedValue([]); // ninguém teve reunião → red
      const service = serviceWith(client);

      const result = await service.getHierarchy('sg1');

      expect(result.ancestors).toEqual([]);
      expect(result.tree?.id).toBe('sg1');
      expect(result.tree?.generation).toBe(0);
      expect(result.tree?.health_status).toBe('red');
      expect(result.tree?.children.map((c) => c.id)).toEqual(['sg2', 'sg3']);
      expect(result.tree?.children[0]?.generation).toBe(1);
      expect(result.tree?.children.find((c) => c.id === 'sg2')?.children.map((c) => c.id)).toEqual([
        'sg4',
      ]);
      expect(
        result.tree?.children.find((c) => c.id === 'sg2')?.children[0]?.generation,
      ).toBe(2);
      expect(result.tree?.children.find((c) => c.id === 'sg3')?.children).toEqual([]);
    });

    it('CEL20-06: célula com reunião recente sai verde — exercita a agregação real de groupBy', async () => {
      const client = clientWith();
      client.$queryRaw.mockResolvedValue([row('sg1', null, 1)]);
      client.smallGroup.findUnique.mockResolvedValue({ parent_group_id: null });
      const hoje = new Date();
      client.groupMeeting.groupBy.mockResolvedValue([
        { small_group_id: 'sg1', _max: { occurred_at: hoje } },
      ]);
      const service = serviceWith(client);

      const result = await service.getHierarchy('sg1');

      expect(result.tree?.health_status).toBe('green');
    });
  });

  describe('getHealth', () => {
    it('CEL20-04: célula sem GroupMeeting nenhum é red, com last_meeting_at e days_since_last_meeting nulos', async () => {
      const client = clientWith();
      client.groupMeeting.aggregate.mockResolvedValue({ _max: { occurred_at: null } });
      const service = serviceWith(client);

      const result = await service.getHealth('sg1');

      expect(client.groupMeeting.aggregate).toHaveBeenCalledWith({
        where: { small_group_id: 'sg1' },
        _max: { occurred_at: true },
      });
      expect(result).toEqual({
        status: 'red',
        last_meeting_at: null,
        days_since_last_meeting: null,
      });
    });

    it('CEL20-04: encontro recente (hoje) é green, com days_since_last_meeting = 0', async () => {
      const client = clientWith();
      const now = new Date();
      client.groupMeeting.aggregate.mockResolvedValue({ _max: { occurred_at: now } });
      const service = serviceWith(client);

      const result = await service.getHealth('sg1');

      expect(result.status).toBe('green');
      expect(result.last_meeting_at).toBe(now);
      expect(result.days_since_last_meeting).toBe(0);
    });

    it('CEL20-04: encontro há 20 dias é yellow', async () => {
      const client = clientWith();
      const vinteDias = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
      client.groupMeeting.aggregate.mockResolvedValue({ _max: { occurred_at: vinteDias } });
      const service = serviceWith(client);

      const result = await service.getHealth('sg1');

      expect(result.status).toBe('yellow');
      expect(result.days_since_last_meeting).toBe(20);
    });
  });

  describe('getAncestors', () => {
    // Formato bruto que o Prisma devolve (com o `leader` aninhado) — o que o
    // método expõe já achata para `leader_person_name` (ver `mapped`).
    const rawAncestor = (id: string, parent: string | null) => ({
      id,
      name: `Grupo ${id}`,
      leader_person_id: 'lider',
      parent_group_id: parent,
      leader: { full_name: 'Líder' },
    });
    const mapped = (id: string, parent: string | null) => ({
      id,
      name: `Grupo ${id}`,
      leader_person_id: 'lider',
      leader_person_name: 'Líder',
      parent_group_id: parent,
    });

    it('CEL20-06: célula raiz (sem parent_group_id) não tem ancestrais', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValue({ parent_group_id: null });
      const service = serviceWith(client);

      expect(await service.getAncestors('sg1')).toEqual([]);
    });

    it('CEL20-06: 1 ancestral — retorna só o pai, com o nome do líder achatado', async () => {
      const client = clientWith();
      client.smallGroup.findUnique
        .mockResolvedValueOnce({ parent_group_id: 'pai' })
        .mockResolvedValueOnce(rawAncestor('pai', null));
      const service = serviceWith(client);

      const result = await service.getAncestors('sg1');

      expect(result).toEqual([mapped('pai', null)]);
    });

    it('CEL20-06: 3 ancestrais (teto) — mais próximo primeiro, mesmo com uma 4ª geração acima', async () => {
      const client = clientWith();
      client.smallGroup.findUnique
        .mockResolvedValueOnce({ parent_group_id: 'pai' })
        .mockResolvedValueOnce(rawAncestor('pai', 'avo'))
        .mockResolvedValueOnce(rawAncestor('avo', 'bisavo'))
        .mockResolvedValueOnce(rawAncestor('bisavo', 'tataravo'));
      const service = serviceWith(client);

      const result = await service.getAncestors('sg1');

      expect(result.map((a) => a.id)).toEqual(['pai', 'avo', 'bisavo']);
      // A 4ª geração (tataravo) nunca é buscada — teto de 3 corta o loop antes.
      expect(client.smallGroup.findUnique).toHaveBeenCalledTimes(4);
    });

    it('CEL20-06: pai referenciado sumiu entre as duas consultas — para o loop sem estourar', async () => {
      const client = clientWith();
      client.smallGroup.findUnique
        .mockResolvedValueOnce({ parent_group_id: 'pai' })
        .mockResolvedValueOnce(null);
      const service = serviceWith(client);

      const result = await service.getAncestors('sg1');

      expect(result).toEqual([]);
    });

    it('CEL20-06: pai sem relação de líder resolvida — leader_person_name null', async () => {
      const client = clientWith();
      client.smallGroup.findUnique.mockResolvedValueOnce({ parent_group_id: 'pai' }).mockResolvedValueOnce({
        id: 'pai',
        name: 'Grupo pai',
        leader_person_id: 'lider',
        parent_group_id: null,
        leader: null,
      });
      const service = serviceWith(client);

      const result = await service.getAncestors('sg1');

      expect(result).toEqual([mapped('pai', null)].map((a) => ({ ...a, leader_person_name: null })));
    });
  });

  describe('checkAbsenceAlerts', () => {
    it('retorna vazio quando não há reuniões registradas', async () => {
      const client = clientWith();
      client.groupMembership.findMany.mockResolvedValue([{ person_id: 'p1', person: { id: 'p1' } }]);
      client.groupMeeting.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      expect(await service.checkAbsenceAlerts('sg1')).toEqual([]);
      expect(client.attendanceRecord.findMany).not.toHaveBeenCalled();
    });

    it('lista as pessoas que não compareceram nas últimas 3 reuniões', async () => {
      const client = clientWith();
      client.groupMembership.findMany.mockResolvedValue([
        { person_id: 'p1', person: { id: 'p1', full_name: 'Ana' } },
        { person_id: 'p2', person: { id: 'p2', full_name: 'Bia' } },
      ]);
      client.groupMeeting.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
      client.attendanceRecord.findMany.mockResolvedValue([{ person_id: 'p1' }]);
      const service = serviceWith(client);

      const result = await service.checkAbsenceAlerts('sg1');

      expect(result).toEqual([{ id: 'p2', full_name: 'Bia' }]);
    });
  });

  describe('findMine', () => {
    it('lança NotFoundException quando o usuário não tem vínculo de pessoa (MOB-09-09)', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const service = serviceWith(client);

      await expect(service.findMine('u1', 't1', 'g1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devolve lista vazia quando a pessoa não tem GroupMembership (MOB-09-09)', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.groupMembership.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      const result = await service.findMine('u1', 't1', 'g1');

      expect(result).toEqual([]);
    });

    it('mapeia um item por GroupMembership, com o role da pessoa naquele grupo (MOB-09-09)', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.groupMembership.findMany.mockResolvedValue([
        {
          role: 'leader',
          smallGroup: { id: 'sg1', name: 'Grupo do Bairro', meeting_time: '19:30', recurrence: 'weekly' },
        },
        {
          role: 'member',
          smallGroup: { id: 'sg2', name: 'Grupo da Vila', meeting_time: null, recurrence: null },
        },
      ]);
      const service = serviceWith(client);

      const result = await service.findMine('u1', 't1', 'g1');

      expect(result).toEqual([
        { id: 'sg1', name: 'Grupo do Bairro', meeting_time: '19:30', recurrence: 'weekly', role: 'leader' },
        { id: 'sg2', name: 'Grupo da Vila', meeting_time: null, recurrence: null, role: 'member' },
      ]);
      expect(client.groupMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { person_id: 'p1', tenant_id: 't1', congregation_id: 'g1' },
        }),
      );
    });
  });

  describe('listVisitRequests', () => {
    it('devolve os pedidos da célula, do mais recente para o mais antigo', async () => {
      const client = clientWith();
      const pedidos = [{ id: 'vr1' }, { id: 'vr2' }];
      client.smallGroupVisitRequest.findMany.mockResolvedValue(pedidos);
      const service = serviceWith(client);

      const result = await service.listVisitRequests('sg1');

      expect(result).toBe(pedidos);
      expect(client.smallGroupVisitRequest.findMany).toHaveBeenCalledWith({
        where: { small_group_id: 'sg1' },
        orderBy: { created_at: 'desc' },
      });
    });
  });
});
