import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CelebrationAttendanceService, toCounts } from './celebration-attendance.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

function clientWith() {
  return {
    celebrationInstance: { findFirst: jest.fn(), findMany: jest.fn() },
    celebrationAttendance: { upsert: jest.fn(), findMany: jest.fn() },
    celebrationAssignment: { findFirst: jest.fn() },
    userAccount: { findUnique: jest.fn() },
  };
}

function serviceWith(client: ReturnType<typeof clientWith>) {
  return new CelebrationAttendanceService({ client } as unknown as PrismaService);
}

const user = (roles: string[]): JwtPayload =>
  ({ sub: 'u1', tenant_id: 't1', congregation_id: 'g1', roles, plan: 'premium' }) as JwtPayload;

const dto = { children: 10, members: 50, attendees: 8, visitors: 4 };
const instance = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  congregation_id: 'g1',
  status: 'scheduled',
  scheduled_date: new Date('2026-10-18T00:00:00.000Z'),
  congregation: { timezone: 'America/Sao_Paulo' },
  ...over,
});
// 18/10/2026 15:00 em Brasília.
const NOW = new Date('2026-10-18T18:00:00.000Z');

describe('CelebrationAttendanceService', () => {
  describe('save', () => {
    it('404 quando a celebração não existe na congregação', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).save('i1', user(['pastor']), dto, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('liderança grava sem consultar a escala (upsert) e devolve o total', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance());
      const updated = new Date('2026-10-18T18:00:00Z');
      client.celebrationAttendance.upsert.mockResolvedValue({ ...dto, updated_at: updated });

      const result = await serviceWith(client).save('i1', user(['pastor']), dto, NOW);

      expect(client.userAccount.findUnique).not.toHaveBeenCalled();
      expect(client.celebrationAttendance.upsert).toHaveBeenCalledWith({
        where: { celebration_instance_id: 'i1' },
        create: { ...dto, updated_by: 'u1', tenant_id: 't1', congregation_id: 'g1', celebration_instance_id: 'i1' },
        update: { ...dto, updated_by: 'u1' },
      });
      expect(result).toEqual({ celebration_instance_id: 'i1', ...dto, total: 72, updated_at: updated });
    });

    it('escalado no ministério responsável grava', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance());
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.celebrationAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      client.celebrationAttendance.upsert.mockResolvedValue({ ...dto, updated_at: new Date() });

      await serviceWith(client).save('i1', user(['volunteer']), dto, NOW);

      expect(client.celebrationAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: 't1',
          status: { in: ['pending', 'confirmed'] },
          volunteerProfile: { person_id: 'p1' },
          celebrationMinistry: {
            ministry: { counts_attendance: true },
            schedule: { celebration_instance_id: 'i1' },
          },
        },
        select: { id: true },
      });
      expect(client.celebrationAttendance.upsert).toHaveBeenCalled();
    });

    it('403 quando não está escalado no ministério responsável', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance());
      client.userAccount.findUnique.mockResolvedValue({ person_id: 'p1' });
      client.celebrationAssignment.findFirst.mockResolvedValue(null);

      await expect(serviceWith(client).save('i1', user(['member']), dto, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(client.celebrationAttendance.upsert).not.toHaveBeenCalled();
    });

    it('403 quando a conta não tem pessoa vinculada', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance());
      client.userAccount.findUnique.mockResolvedValue(null);

      await expect(serviceWith(client).save('i1', user(['member']), dto, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(client.celebrationAssignment.findFirst).not.toHaveBeenCalled();
    });

    it('422 quando o culto está cancelado', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance({ status: 'cancelled' }));
      await expect(serviceWith(client).save('i1', user(['pastor']), dto, NOW)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('422 antes do dia do culto', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(
        instance({ scheduled_date: new Date('2026-10-19T00:00:00.000Z') }),
      );
      await expect(serviceWith(client).save('i1', user(['pastor']), dto, NOW)).rejects.toThrow(
        'a partir do dia do culto',
      );
    });

    it('o dia do culto vale no fuso da congregação (01h UTC de 19/10 ainda é 18/10 em Brasília)', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance());
      client.celebrationAttendance.upsert.mockResolvedValue({ ...dto, updated_at: new Date() });
      await expect(
        serviceWith(client).save('i1', user(['pastor']), dto, new Date('2026-10-19T01:00:00.000Z')),
      ).resolves.toBeDefined();
    });

    it('usa a data atual quando `now` não é informado', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(
        instance({ scheduled_date: new Date('2020-01-01T00:00:00.000Z') }),
      );
      client.celebrationAttendance.upsert.mockResolvedValue({ ...dto, updated_at: new Date() });
      await expect(serviceWith(client).save('i1', user(['pastor']), dto)).resolves.toBeDefined();
    });
  });

  describe('summary', () => {
    it('média por categoria só dos cultos com contagem, com 1 casa decimal', async () => {
      const client = clientWith();
      client.celebrationAttendance.findMany.mockResolvedValue([
        { children: 10, members: 50, attendees: 8, visitors: 4 },
        { children: 5, members: 41, attendees: 7, visitors: 1 },
        { children: 0, members: 30, attendees: 2, visitors: 0 },
      ]);

      const result = await serviceWith(client).summary(user(['pastor']), {
        celebration_id: 'c1',
        date_from: '2026-08-01',
        date_to: '2026-10-18',
      });

      expect(client.celebrationAttendance.findMany).toHaveBeenCalledWith({
        where: {
          celebrationInstance: {
            tenant_id: 't1',
            status: { not: 'cancelled' },
            celebration_id: 'c1',
            scheduled_date: { gte: new Date('2026-08-01'), lte: new Date('2026-10-18') },
          },
        },
        select: { children: true, members: true, attendees: true, visitors: true },
      });
      expect(result).toEqual({
        services_counted: 3,
        totals: { children: 15, members: 121, attendees: 17, visitors: 5, total: 158 },
        average: { children: 5, members: 40.3, attendees: 5.7, visitors: 1.7, total: 52.7 },
      });
    });

    it('sem nenhuma contagem devolve zero cultos (a tela mostra estado vazio)', async () => {
      const client = clientWith();
      client.celebrationAttendance.findMany.mockResolvedValue([]);

      const result = await serviceWith(client).summary(user(['pastor']), {});

      expect(result.services_counted).toBe(0);
      expect(result.average.total).toBe(0);
      expect(client.celebrationAttendance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { celebrationInstance: { tenant_id: 't1', status: { not: 'cancelled' } } },
        }),
      );
    });

    it('aceita só um dos limites de data', async () => {
      const client = clientWith();
      client.celebrationAttendance.findMany.mockResolvedValue([]);
      await serviceWith(client).summary(user(['pastor']), { date_from: '2026-08-01' });
      await serviceWith(client).summary(user(['pastor']), { date_to: '2026-10-18' });
      const wheres = client.celebrationAttendance.findMany.mock.calls.map(
        (c) => c[0].where.celebrationInstance.scheduled_date,
      );
      expect(wheres).toEqual([{ gte: new Date('2026-08-01') }, { lte: new Date('2026-10-18') }]);
    });
  });

  describe('list', () => {
    it('marca como sem contagem o culto que já passou e esconde o futuro sem contagem', async () => {
      const client = clientWith();
      const celebration = { id: 'c1', name: 'Culto', start_time: '19:00' };
      client.celebrationInstance.findMany.mockResolvedValue([
        { id: 'i4', scheduled_date: new Date('2026-10-25'), celebration, attendance: null },
        { id: 'i3', scheduled_date: new Date('2026-10-18'), celebration, attendance: { children: 1, members: 2, attendees: 3, visitors: 4 } },
        { id: 'i2', scheduled_date: new Date('2026-10-11'), celebration, attendance: null },
        { id: 'i1', scheduled_date: new Date('2026-11-01'), celebration, attendance: { children: 0, members: 1, attendees: 0, visitors: 0 } },
      ]);

      const result = await serviceWith(client).list(user(['pastor']), {}, NOW);

      expect(result.map((r) => r.celebration_instance_id)).toEqual(['i3', 'i2', 'i1']);
      expect(result[0]!.attendance).toEqual({ children: 1, members: 2, attendees: 3, visitors: 4, total: 10 });
      expect(result[1]!.attendance).toBeNull();
    });

    it('usa a data atual quando `now` não é informado', async () => {
      const client = clientWith();
      client.celebrationInstance.findMany.mockResolvedValue([]);
      await expect(serviceWith(client).list(user(['pastor']), {})).resolves.toEqual([]);
    });
  });

  it('toCounts soma as quatro categorias', () => {
    expect(toCounts({ children: 1, members: 2, attendees: 3, visitors: 4 }).total).toBe(10);
  });
});
