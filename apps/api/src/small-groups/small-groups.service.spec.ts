import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SmallGroupsService } from './small-groups.service';
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
    },
    groupMeeting: { findMany: jest.fn() },
    attendanceRecord: { findMany: jest.fn() },
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
});
