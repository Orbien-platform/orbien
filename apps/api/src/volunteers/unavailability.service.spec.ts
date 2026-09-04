import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UnavailabilityService } from './unavailability.service';
import { PrismaService } from '../prisma/prisma.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    userAccount: { findUnique: jest.fn() },
    volunteerProfile: { findFirst: jest.fn() },
    volunteerUnavailability: { upsert: jest.fn(), findUnique: jest.fn() },
    volunteerUnavailabilityDate: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
    ministry: { findFirst: jest.fn() },
    volunteerMinistry: { findUnique: jest.fn(), findMany: jest.fn() },
    ...overrides,
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, runInTx?: jest.Mock) {
  const prisma = {
    client,
    runInTx: runInTx ?? jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(client)),
  } as unknown as PrismaService;
  return new UnavailabilityService(prisma);
}

describe('UnavailabilityService', () => {
  describe('upsert', () => {
    it('rejeita datas duplicadas na mesma requisição', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await expect(
        service.upsert('u1', 't1', 'g1', {
          referenceMonth: 9,
          referenceYear: 2026,
          dates: ['2026-09-06', '2026-09-06'],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(client.userAccount.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita data cujo mês não confere com referenceMonth (data única fora do mês de referência)', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await expect(
        service.upsert('u1', 't1', 'g1', {
          referenceMonth: 9,
          referenceYear: 2026,
          dates: ['2026-10-01'],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita data cujo ano não confere com referenceYear', async () => {
      const client = clientWith();
      const service = serviceWith(client);

      await expect(
        service.upsert('u1', 't1', 'g1', {
          referenceMonth: 9,
          referenceYear: 2026,
          dates: ['2025-09-06'],
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança NotFoundException quando o usuário não tem pessoa vinculada', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const service = serviceWith(client);

      await expect(
        service.upsert('u1', 't1', 'g1', {
          referenceMonth: 9,
          referenceYear: 2026,
          dates: ['2026-09-06'],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lança NotFoundException quando não há perfil de voluntário', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.upsert('u1', 't1', 'g1', {
          referenceMonth: 9,
          referenceYear: 2026,
          dates: ['2026-09-06'],
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('registra um intervalo de datas do mesmo mês, gravando cada uma em UTC à meia-noite', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      client.volunteerUnavailability.upsert.mockResolvedValue({ id: 'unav-1' });
      client.volunteerUnavailability.findUnique.mockResolvedValue({
        id: 'unav-1',
        dates: [{ date: new Date('2026-09-06T00:00:00.000Z') }, { date: new Date('2026-09-13T00:00:00.000Z') }],
      });
      const service = serviceWith(client);

      const result = await service.upsert('u1', 't1', 'g1', {
        referenceMonth: 9,
        referenceYear: 2026,
        dates: ['2026-09-06', '2026-09-13'],
        notes: 'Viagem',
      } as never);

      expect(client.volunteerUnavailabilityDate.deleteMany).toHaveBeenCalledWith({
        where: { unavailability_id: 'unav-1' },
      });
      expect(client.volunteerUnavailabilityDate.createMany).toHaveBeenCalledWith({
        data: [
          {
            tenant_id: 't1',
            congregation_id: 'g1',
            unavailability_id: 'unav-1',
            date: new Date('2026-09-06T00:00:00.000Z'),
          },
          {
            tenant_id: 't1',
            congregation_id: 'g1',
            unavailability_id: 'unav-1',
            date: new Date('2026-09-13T00:00:00.000Z'),
          },
        ],
      });
      expect(result?.id).toBe('unav-1');
    });

    it('não chama createMany quando dates é uma lista vazia (apenas limpa as datas anteriores)', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      client.volunteerUnavailability.upsert.mockResolvedValue({ id: 'unav-1' });
      client.volunteerUnavailability.findUnique.mockResolvedValue({ id: 'unav-1', dates: [] });
      const service = serviceWith(client);

      await service.upsert('u1', 't1', 'g1', {
        referenceMonth: 9,
        referenceYear: 2026,
        dates: [],
      } as never);

      expect(client.volunteerUnavailabilityDate.createMany).not.toHaveBeenCalled();
      expect(client.volunteerUnavailabilityDate.deleteMany).toHaveBeenCalled();
    });
  });

  describe('getMyUnavailability', () => {
    it('resolve o perfil e busca a indisponibilidade do mês/ano', async () => {
      const client = clientWith();
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      client.volunteerUnavailability.findUnique.mockResolvedValue({ id: 'unav-1', dates: [] });
      const service = serviceWith(client);

      const result = await service.getMyUnavailability('u1', 't1', 'g1', 9, 2026);

      expect(client.volunteerUnavailability.findUnique).toHaveBeenCalledWith({
        where: {
          volunteer_profile_id_reference_month_reference_year: {
            volunteer_profile_id: 'profile-1',
            reference_month: 9,
            reference_year: 2026,
          },
        },
        include: { dates: { select: { date: true }, orderBy: { date: 'asc' } } },
      });
      expect(result).toEqual({ id: 'unav-1', dates: [] });
    });
  });

  describe('getMinistryAvailability', () => {
    it('lança NotFoundException quando o ministério não existe', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.getMinistryAvailability('u1', ['ministry_leader'], 't1', 'g1', 'm1', '2026-09-06'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('admin_congregation acessa sem precisar ser líder do ministério', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerMinistry.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      const result = await service.getMinistryAvailability(
        'u1',
        ['admin_congregation'],
        't1',
        'g1',
        'm1',
        '2026-09-06',
      );

      expect(client.userAccount.findUnique).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('rejeita quando o solicitante não tem perfil de voluntário nesse ministério', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.userAccount.findUnique.mockResolvedValue({ person_id: null });
      const service = serviceWith(client);

      await expect(
        service.getMinistryAvailability('u1', ['volunteer'], 't1', 'g1', 'm1', '2026-09-06'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejeita quando o voluntário não é líder do ministério consultado', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ role: 'volunteer' });
      const service = serviceWith(client);

      await expect(
        service.getMinistryAvailability('u1', ['volunteer'], 't1', 'g1', 'm1', '2026-09-06'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejeita quando o solicitante não tem nenhum vínculo com o ministério', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-1' });
      client.volunteerMinistry.findUnique.mockResolvedValue(null);
      const service = serviceWith(client);

      await expect(
        service.getMinistryAvailability('u1', ['volunteer'], 't1', 'g1', 'm1', '2026-09-06'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('líder do ministério vê a disponibilidade e marca quem está indisponível na data', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p-leader' });
      client.volunteerProfile.findFirst.mockResolvedValue({ id: 'profile-leader' });
      client.volunteerMinistry.findUnique.mockResolvedValue({ role: 'leader' });
      client.volunteerMinistry.findMany.mockResolvedValue([
        {
          id: 'vm1',
          role: 'leader',
          volunteerProfile: { id: 'profile-leader', person: { id: 'p-leader', full_name: 'Ana' } },
        },
        {
          id: 'vm2',
          role: 'volunteer',
          volunteerProfile: { id: 'profile-2', person: { id: 'p2', full_name: 'Bia' } },
        },
      ]);
      client.volunteerUnavailabilityDate.findMany.mockResolvedValue([
        { unavailability: { volunteer_profile_id: 'profile-2' } },
      ]);
      const service = serviceWith(client);

      const result = await service.getMinistryAvailability(
        'u-leader',
        ['ministry_leader'],
        't1',
        'g1',
        'm1',
        '2026-09-06',
      );

      expect(client.volunteerUnavailabilityDate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ date: new Date('2026-09-06T00:00:00.000Z') }),
        }),
      );
      expect(result).toEqual([
        {
          volunteer_ministry_id: 'vm1',
          role: 'leader',
          volunteer_profile_id: 'profile-leader',
          person: { id: 'p-leader', full_name: 'Ana' },
          unavailable: false,
        },
        {
          volunteer_ministry_id: 'vm2',
          role: 'volunteer',
          volunteer_profile_id: 'profile-2',
          person: { id: 'p2', full_name: 'Bia' },
          unavailable: true,
        },
      ]);
    });

    it('retorna lista vazia quando o ministério não tem membros', async () => {
      const client = clientWith();
      client.ministry.findFirst.mockResolvedValue({ id: 'm1' });
      client.volunteerMinistry.findMany.mockResolvedValue([]);
      const service = serviceWith(client);

      const result = await service.getMinistryAvailability(
        'u1',
        ['admin_congregation'],
        't1',
        'g1',
        'm1',
        '2026-09-06',
      );

      expect(result).toEqual([]);
      expect(client.volunteerUnavailabilityDate.findMany).not.toHaveBeenCalled();
    });
  });
});
