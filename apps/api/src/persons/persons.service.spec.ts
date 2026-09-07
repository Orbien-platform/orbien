import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PersonsService } from './persons.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function serviceWith(overrides: Record<string, unknown> = {}) {
  const client = {
    person: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    household: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    householdMember: {
      create: jest.fn(),
    },
    financialTransaction: {
      findFirst: jest.fn(),
    },
    consentRecord: {
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const system = {
    person: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mergedClient = { ...client, ...overrides };
  const prisma = { client: mergedClient, system } as unknown as PrismaService;
  return { service: new PersonsService(prisma), client: mergedClient, system };
}

describe('PersonsService', () => {
  describe('create', () => {
    it('cria a pessoa e não busca duplicatas quando não há telefone', async () => {
      const { service, client } = serviceWith();
      client.person.create.mockResolvedValue({ id: 'p1', full_name: 'Ana' });

      const result = await service.create({ full_name: 'Ana' } as never, user);

      expect(client.person.create).toHaveBeenCalledWith({
        data: { full_name: 'Ana', tenant_id: 'tenant-1', congregation_id: 'cong-1' },
      });
      expect(client.person.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({ person: { id: 'p1', full_name: 'Ana' }, possible_duplicates: [] });
    });

    it('busca possíveis duplicatas por telefone, excluindo a própria pessoa criada', async () => {
      const { service, client } = serviceWith();
      client.person.create.mockResolvedValue({ id: 'p1', full_name: 'Ana', phone: '+5511999999999' });
      client.person.findMany.mockResolvedValue([{ id: 'p2', full_name: 'Ana Duplicada' }]);

      const result = await service.create(
        { full_name: 'Ana', phone: '+5511999999999' } as never,
        user,
      );

      expect(client.person.findMany).toHaveBeenCalledWith({
        where: { phone: '+5511999999999', id: { not: 'p1' } },
        select: { id: true, full_name: true, phone: true, classification: true },
      });
      expect(result.possible_duplicates).toEqual([{ id: 'p2', full_name: 'Ana Duplicada' }]);
    });
  });

  describe('findAll', () => {
    it('aplica todos os filtros e pagina', async () => {
      const { service, client } = serviceWith();
      client.person.findMany.mockResolvedValue([{ id: 'p1' }]);
      client.person.count.mockResolvedValue(1);

      const result = await service.findAll({
        classification: 'member',
        gender: 'male',
        tag: 'jovens',
        search: 'ana',
        page: 2,
        limit: 10,
      } as never);

      expect(client.person.findMany).toHaveBeenCalledWith({
        where: {
          deleted_at: null,
          classification: 'member',
          gender: 'male',
          full_name: { contains: 'ana', mode: 'insensitive' },
          personTags: { some: { tag: { equals: 'jovens', mode: 'insensitive' } } },
        },
        skip: 10,
        take: 10,
        orderBy: { full_name: 'asc' },
      });
      expect(result).toEqual({ data: [{ id: 'p1' }], total: 1, page: 2, limit: 10 });
    });

    it('sem filtros, usa where vazio e a primeira página', async () => {
      const { service, client } = serviceWith();
      client.person.findMany.mockResolvedValue([]);
      client.person.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 } as never);

      expect(client.person.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deleted_at: null }, skip: 0, take: 20 }),
      );
    });
  });

  describe('findOne', () => {
    it('retorna a pessoa com as filiações de família', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({ id: 'p1', householdMemberships: [] });

      const result = await service.findOne('p1');

      expect(client.person.findUnique).toHaveBeenCalledWith({
        where: { id: 'p1' },
        include: { householdMemberships: true },
      });
      expect(result).toEqual({ id: 'p1', householdMemberships: [] });
    });

    it('lança NotFoundException quando a pessoa não existe', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('lança NotFoundException quando a pessoa não existe', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue(null);

      await expect(service.update('nope', {} as never)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('exige data de membresia ao promover para membro sem data nova nem existente', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({ id: 'p1', membership_date: null });

      await expect(
        service.update('p1', { classification: 'member' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.person.update).not.toHaveBeenCalled();
    });

    it('permite promover para membro quando o dto traz a data', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({ id: 'p1', membership_date: null });
      client.person.update.mockResolvedValue({ id: 'p1', classification: 'member' });

      await service.update('p1', { classification: 'member', membership_date: '2026-01-01' } as never);

      expect(client.person.update).toHaveBeenCalled();
    });

    it('permite promover para membro quando já havia data de membresia', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({ id: 'p1', membership_date: new Date('2020-01-01') });
      client.person.update.mockResolvedValue({ id: 'p1', classification: 'member' });

      await service.update('p1', { classification: 'member' } as never);

      expect(client.person.update).toHaveBeenCalled();
    });

    it('atualização sem mudar classificação não exige data de membresia', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({ id: 'p1', membership_date: null });
      client.person.update.mockResolvedValue({ id: 'p1', phone: '+5511900000000' });

      await service.update('p1', { phone: '+5511900000000' } as never);

      expect(client.person.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { phone: '+5511900000000' },
      });
    });
  });

  describe('remove', () => {
    it('lança NotFoundException quando a pessoa não existe', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue(null);

      await expect(service.remove('nope', user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando a pessoa já está soft-deletada', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({ id: 'p1', deleted_at: new Date() });

      await expect(service.remove('p1', user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita com 409 quando a pessoa tem histórico financeiro', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({
        id: 'p1',
        tenant_id: 'tenant-1',
        congregation_id: 'cong-1',
        deleted_at: null,
      });
      client.financialTransaction.findFirst.mockResolvedValue({ id: 'tx1' });

      await expect(service.remove('p1', user)).rejects.toBeInstanceOf(ConflictException);
      expect(client.person.update).not.toHaveBeenCalled();
    });

    it('faz soft delete e grava audit log quando não há doações', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({
        id: 'p1',
        tenant_id: 'tenant-1',
        congregation_id: 'cong-1',
        deleted_at: null,
      });
      client.financialTransaction.findFirst.mockResolvedValue(null);
      client.person.update.mockResolvedValue({ id: 'p1', deleted_at: new Date() });

      const result = await service.remove('p1', user);

      expect(client.person.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { deleted_at: expect.any(Date) },
      });
      expect(client.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          actor_user_id: 'user-1',
          subject_person_id: 'p1',
          entity: 'person',
          action: 'person.deleted',
        },
      });
      expect(result).toEqual({ id: 'p1', deleted_at: expect.any(Date) });
    });
  });

  describe('anonymize', () => {
    it('lança NotFoundException quando a pessoa não existe', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue(null);

      await expect(service.anonymize('nope', user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('zera os dados de identificação, revoga consentimentos e grava audit log', async () => {
      const { service, client } = serviceWith();
      client.person.findUnique.mockResolvedValue({
        id: 'p1',
        tenant_id: 'tenant-1',
        congregation_id: 'cong-1',
      });
      client.person.update.mockResolvedValue({ id: 'p1', full_name: 'ANONIMIZADO' });

      const result = await service.anonymize('p1', user);

      expect(client.person.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: {
          full_name: 'ANONIMIZADO',
          phone: null,
          email: null,
          photo_url: null,
          birth_date: null,
          anonymized_at: expect.any(Date),
          anonymization_reason: 'Solicitação do titular - Art. 18, LGPD',
        },
      });
      expect(client.consentRecord.updateMany).toHaveBeenCalledWith({
        where: { person_id: 'p1', revoked_at: null },
        data: { revoked_at: expect.any(Date), revocation_reason: 'Anonimização solicitada' },
      });
      expect(client.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          actor_user_id: 'user-1',
          subject_person_id: 'p1',
          entity: 'person',
          action: 'person.anonymized',
        },
      });
      expect(result).toEqual({ id: 'p1', full_name: 'ANONIMIZADO' });
    });
  });

  describe('purgeExpiredSoftDeletes', () => {
    it('elimina dados sensíveis de quem foi soft-deletado há mais de 30 dias e não foi anonimizado', async () => {
      const { service, system } = serviceWith();
      system.person.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      system.person.update.mockResolvedValue({});

      const result = await service.purgeExpiredSoftDeletes();

      expect(system.person.findMany).toHaveBeenCalledWith({
        where: { deleted_at: { lte: expect.any(Date) }, anonymized_at: null },
        select: { id: true },
      });
      expect(system.person.update).toHaveBeenCalledTimes(2);
      expect(system.person.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ full_name: 'ANONIMIZADO' }),
      });
      expect(result).toEqual({ purged: 2 });
    });

    it('não chama update quando não há ninguém a purgar', async () => {
      const { service, system } = serviceWith();
      system.person.findMany.mockResolvedValue([]);

      const result = await service.purgeExpiredSoftDeletes();

      expect(system.person.update).not.toHaveBeenCalled();
      expect(result).toEqual({ purged: 0 });
    });
  });

  describe('createHousehold', () => {
    it('cria a família com tenant e congregação do usuário', async () => {
      const { service, client } = serviceWith();
      client.household.create.mockResolvedValue({ id: 'h1', name: 'Família Silva' });

      const result = await service.createHousehold({ name: 'Família Silva' }, user);

      expect(client.household.create).toHaveBeenCalledWith({
        data: { name: 'Família Silva', tenant_id: 'tenant-1', congregation_id: 'cong-1' },
      });
      expect(result).toEqual({ id: 'h1', name: 'Família Silva' });
    });
  });

  describe('findHousehold', () => {
    it('lança NotFoundException quando a família não existe', async () => {
      const { service, client } = serviceWith();
      client.household.findUnique.mockResolvedValue(null);

      await expect(service.findHousehold('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('retorna a família com os membros e suas pessoas', async () => {
      const { service, client } = serviceWith();
      const household = { id: 'h1', members: [{ person: { id: 'p1' } }] };
      client.household.findUnique.mockResolvedValue(household);

      const result = await service.findHousehold('h1');

      expect(client.household.findUnique).toHaveBeenCalledWith({
        where: { id: 'h1' },
        include: { members: { include: { person: true } } },
      });
      expect(result).toEqual(household);
    });
  });

  describe('addHouseholdMember', () => {
    it('adiciona o membro depois de confirmar que a família existe', async () => {
      const { service, client } = serviceWith();
      client.household.findUnique.mockResolvedValue({ id: 'h1', members: [] });
      client.householdMember.create.mockResolvedValue({ id: 'hm1' });

      const result = await service.addHouseholdMember('h1', { person_id: 'p1', role: 'spouse' } as never);

      expect(client.householdMember.create).toHaveBeenCalledWith({
        data: { household_id: 'h1', person_id: 'p1', role: 'spouse' },
      });
      expect(result).toEqual({ id: 'hm1' });
    });

    it('propaga NotFoundException quando a família não existe', async () => {
      const { service, client } = serviceWith();
      client.household.findUnique.mockResolvedValue(null);

      await expect(
        service.addHouseholdMember('nope', { person_id: 'p1', role: 'spouse' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(client.householdMember.create).not.toHaveBeenCalled();
    });

    it('converte violação de unicidade (P2002) em BadRequestException', async () => {
      const { service, client } = serviceWith();
      client.household.findUnique.mockResolvedValue({ id: 'h1', members: [] });
      client.householdMember.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.0.0' }),
      );

      await expect(
        service.addHouseholdMember('h1', { person_id: 'p1', role: 'spouse' } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propaga erros que não são P2002', async () => {
      const { service, client } = serviceWith();
      client.household.findUnique.mockResolvedValue({ id: 'h1', members: [] });
      const boom = new Error('conexão caiu');
      client.householdMember.create.mockRejectedValue(boom);

      await expect(
        service.addHouseholdMember('h1', { person_id: 'p1', role: 'spouse' } as never),
      ).rejects.toBe(boom);
    });
  });
});
