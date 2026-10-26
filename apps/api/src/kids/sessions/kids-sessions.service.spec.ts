import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { KidsSessionsService } from './kids-sessions.service';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsSessionAccessService } from '../checkin/kids-session-access.service';

function clientWith() {
  return {
    celebrationInstance: { findFirst: jest.fn() },
    kidsRoom: { findMany: jest.fn() },
    kidsSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      createManyAndReturn: jest.fn(),
      update: jest.fn(),
    },
    kidsCheckin: { count: jest.fn() },
    celebrationAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    congregation: { findFirst: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) },
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, scheduled: string[] = []) {
  const access = { scheduledAmong: jest.fn().mockResolvedValue(new Set(scheduled)) };
  const svc = new KidsSessionsService({ client } as unknown as PrismaService, access as unknown as KidsSessionAccessService);
  return Object.assign(svc, { access });
}

const instance = { id: 'i1', status: 'published' };
const room = (id: string, extra = {}) => ({ id, is_active: true, ...extra });

describe('KidsSessionsService', () => {
  describe('listOpenToday', () => {
    const row = (id: string) => ({
      id,
      status: 'open',
      room: { id: `r-${id}`, name: 'Maternal', min_age_months: 24, max_age_months: 47, allows_out_of_range: false },
      celebrationInstance: {
        id: `i-${id}`,
        scheduled_date: new Date('2026-10-25T00:00:00.000Z'),
        celebration: { name: 'Culto', start_time: '10:00' },
      },
    });
    const actor = (...roles: string[]) => ({ userId: 'u1', tenantId: 't1', congregationId: 'g1', roles });
    // 2026-10-26 01:00 UTC ainda é dia 25 em São Paulo.
    const now = new Date('2026-10-26T01:00:00.000Z');

    it('filtra sessão aberta, do dia no fuso da congregação, de instância não cancelada', async () => {
      const client = clientWith();
      client.kidsSession.findMany.mockResolvedValue([]);
      await expect(serviceWith(client).listOpenToday(actor('pastor'), now)).resolves.toEqual([]);
      const where = client.kidsSession.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        tenant_id: 't1',
        congregation_id: 'g1',
        status: 'open',
        celebrationInstance: { scheduled_date: new Date('2026-10-25T00:00:00.000Z'), status: { not: 'cancelled' } },
      });
    });

    it('usa o fuso padrão quando a congregação não tem registro', async () => {
      const client = clientWith();
      client.congregation.findFirst.mockResolvedValue(null);
      client.kidsSession.findMany.mockResolvedValue([]);
      await serviceWith(client).listOpenToday(actor('pastor'), now);
      expect(client.kidsSession.findMany.mock.calls[0][0].where.celebrationInstance.scheduled_date).toEqual(
        new Date('2026-10-25T00:00:00.000Z'),
      );
    });

    it('mapeia o contrato e não pede dado de criança nem de saúde', async () => {
      const client = clientWith();
      client.kidsSession.findMany.mockResolvedValue([row('s1')]);
      const out = await serviceWith(client).listOpenToday(actor('member'), now);
      expect(out).toEqual([
        {
          session_id: 's1',
          status: 'open',
          room: { id: 'r-s1', name: 'Maternal', min_age_months: 24, max_age_months: 47, allows_out_of_range: false },
          instance: {
            id: 'i-s1',
            scheduled_date: new Date('2026-10-25T00:00:00.000Z'),
            celebration_name: 'Culto',
            start_time: '10:00',
          },
        },
      ]);
      const select = JSON.stringify(client.kidsSession.findMany.mock.calls[0][0].select);
      expect(select).not.toMatch(/checkin|child|allerg|medical|notes/i);
    });

    it.each(['pastor', 'ministry_leader', 'member'])('%s vê todas, sem consultar a escala', async (role) => {
      const client = clientWith();
      client.kidsSession.findMany.mockResolvedValue([row('s1'), row('s2')]);
      const svc = serviceWith(client);
      const out = await svc.listOpenToday(actor(role), now);
      expect(out.map((s) => s.session_id)).toEqual(['s1', 's2']);
      expect(svc.access.scheduledAmong).not.toHaveBeenCalled();
    });

    it('voluntário vê só as sessões em que está escalado', async () => {
      const client = clientWith();
      client.kidsSession.findMany.mockResolvedValue([row('s1'), row('s2')]);
      const svc = serviceWith(client, ['s2']);
      const out = await svc.listOpenToday(actor('volunteer'), now);
      expect(out.map((s) => s.session_id)).toEqual(['s2']);
      expect(svc.access.scheduledAmong).toHaveBeenCalledWith('u1', ['s1', 's2']);
    });

    it('papel fora da lista não vê nada, mesmo que o service seja chamado', async () => {
      const client = clientWith();
      client.kidsSession.findMany.mockResolvedValue([row('s1')]);
      await expect(serviceWith(client).listOpenToday(actor('visitor'), now)).resolves.toEqual([]);
    });
  });

  describe('listByInstance', () => {
    it('404 quando a instância não é da congregação', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).listByInstance('t1', 'g1', 'i1')).rejects.toBeInstanceOf(NotFoundException);
      expect(client.celebrationInstance.findFirst).toHaveBeenCalledWith({
        where: { id: 'i1', tenant_id: 't1', congregation_id: 'g1' },
        select: { id: true, status: true },
      });
    });

    it('instância sem sessões devolve lista vazia, sem erro (AC 5)', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance);
      client.kidsSession.findMany.mockResolvedValue([]);
      await expect(serviceWith(client).listByInstance('t1', 'g1', 'i1')).resolves.toEqual([]);
    });

    it('lista as sessões da instância com a turma, por idade mínima', async () => {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance);
      client.kidsSession.findMany.mockResolvedValue([{ id: 's1', room: { min_volunteers: 0 } }]);

      const out = await serviceWith(client).listByInstance('t1', 'g1', 'i1');

      expect(out.map((s) => s.id)).toEqual(['s1']);
      expect(client.kidsSession.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 't1', congregation_id: 'g1', celebration_instance_id: 'i1' },
        include: { room: true },
        orderBy: [{ room: { min_age_months: 'asc' } }, { room: { name: 'asc' } }],
      });
    });

    // spec P2 Escala, AC 2: a falta de voluntários é sinalizada na leitura da sessão.
    describe('volunteers_missing (AC 2)', () => {
      const asg = (session: string, vol: string, status: string) => ({
        status,
        volunteer_profile_id: vol,
        celebrationMinistry: { kids_session_id: session },
      });

      function withSessions(minA: number, minB: number, assignments: ReturnType<typeof asg>[]) {
        const client = clientWith();
        client.celebrationInstance.findFirst.mockResolvedValue(instance);
        client.kidsSession.findMany.mockResolvedValue([
          { id: 'sA', room: { min_volunteers: minA } },
          { id: 'sB', room: { min_volunteers: minB } },
        ]);
        client.celebrationAssignment.findMany.mockResolvedValue(assignments);
        return client;
      }

      it('menos escalados que o mínimo: volunteers_missing = diferença', async () => {
        const client = withSessions(3, 0, [asg('sA', 'v1', 'pending')]);
        const out = await serviceWith(client).listByInstance('t1', 'g1', 'i1');
        expect(out[0]).toEqual(expect.objectContaining({ volunteers_scheduled: 1, volunteers_missing: 2 }));
      });

      it('mínimo atingido ou turma sem mínimo: volunteers_missing = 0, nunca negativo', async () => {
        const client = withSessions(1, 0, [asg('sA', 'v1', 'confirmed'), asg('sA', 'v2', 'confirmed')]);
        const out = await serviceWith(client).listByInstance('t1', 'g1', 'i1');
        expect(out[0]).toEqual(expect.objectContaining({ volunteers_scheduled: 2, volunteers_missing: 0 }));
        expect(out[1]).toEqual(expect.objectContaining({ volunteers_scheduled: 0, volunteers_missing: 0 }));
      });

      it('recusado e trocado não contam como escalados', async () => {
        const client = withSessions(2, 0, [
          asg('sA', 'v1', 'declined'),
          asg('sA', 'v2', 'swapped'),
          asg('sA', 'v3', 'confirmed'),
        ]);
        const out = await serviceWith(client).listByInstance('t1', 'g1', 'i1');
        expect(out[0]).toEqual(expect.objectContaining({ volunteers_scheduled: 1, volunteers_missing: 1 }));
      });

      it('consulta as escalas só das sessões listadas, pending/confirmed', async () => {
        const client = withSessions(1, 1, []);
        await serviceWith(client).listByInstance('t1', 'g1', 'i1');
        expect(client.celebrationAssignment.findMany).toHaveBeenCalledWith({
          where: {
            tenant_id: 't1',
            congregation_id: 'g1',
            status: { in: ['pending', 'confirmed'] },
            celebrationMinistry: { kids_session_id: { in: ['sA', 'sB'] } },
          },
          select: { status: true, volunteer_profile_id: true, celebrationMinistry: { select: { kids_session_id: true } } },
        });
      });
    });
  });

  describe('open', () => {
    function ready(roomIds: string[]) {
      const client = clientWith();
      client.celebrationInstance.findFirst.mockResolvedValue(instance);
      client.kidsRoom.findMany.mockResolvedValue(roomIds.map((id) => room(id)));
      client.kidsSession.findMany.mockResolvedValue([]);
      client.kidsSession.createManyAndReturn.mockImplementation(({ data }: { data: { room_id: string }[] }) =>
        Promise.resolve(data.map((d, n) => ({ id: `s${n}`, ...d, status: 'open' }))),
      );
      return client;
    }

    it('cria uma sessão por turma, na congregação da instância (AC 3)', async () => {
      const client = ready(['r1', 'r2']);

      const out = await serviceWith(client).open('t1', 'g1', 'i1', ['r1', 'r2']);

      expect(client.kidsSession.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          { tenant_id: 't1', congregation_id: 'g1', celebration_instance_id: 'i1', room_id: 'r1' },
          { tenant_id: 't1', congregation_id: 'g1', celebration_instance_id: 'i1', room_id: 'r2' },
        ],
      });
      expect(out.map((s) => s.room_id)).toEqual(['r1', 'r2']);
    });

    it('404 quando a instância não existe', async () => {
      const client = ready(['r1']);
      client.celebrationInstance.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).open('t1', 'g1', 'i1', ['r1'])).rejects.toBeInstanceOf(NotFoundException);
      expect(client.kidsSession.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('422 em instância cancelada, sem criar nada', async () => {
      const client = ready(['r1']);
      client.celebrationInstance.findFirst.mockResolvedValue({ id: 'i1', status: 'cancelled' });
      await expect(serviceWith(client).open('t1', 'g1', 'i1', ['r1'])).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(client.kidsSession.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('404 quando alguma turma não é da congregação', async () => {
      const client = ready(['r1']);
      await expect(serviceWith(client).open('t1', 'g1', 'i1', ['r1', 'r9'])).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(client.kidsRoom.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['r1', 'r9'] }, tenant_id: 't1', congregation_id: 'g1' },
      });
      expect(client.kidsSession.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('422 quando a turma está desativada (edge: turma desativada não abre sessão nova)', async () => {
      const client = ready(['r1']);
      client.kidsRoom.findMany.mockResolvedValue([room('r1', { is_active: false })]);
      await expect(serviceWith(client).open('t1', 'g1', 'i1', ['r1'])).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(client.kidsSession.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('409 quando o par instância×turma já existe, sem duplicar nem abrir as outras (AC 4)', async () => {
      const client = ready(['r1', 'r2']);
      client.kidsSession.findMany.mockResolvedValue([{ room_id: 'r2' }]);
      await expect(serviceWith(client).open('t1', 'g1', 'i1', ['r1', 'r2'])).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(client.kidsSession.createManyAndReturn).not.toHaveBeenCalled();
    });

    it('409 também quando a corrida é pega pela unicidade (P2002)', async () => {
      const client = ready(['r1']);
      client.kidsSession.createManyAndReturn.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(serviceWith(client).open('t1', 'g1', 'i1', ['r1'])).rejects.toBeInstanceOf(ConflictException);
    });

    it('relança erro que não é de unicidade', async () => {
      const client = ready(['r1']);
      client.kidsSession.createManyAndReturn.mockRejectedValue(new Error('banco caiu'));
      await expect(serviceWith(client).open('t1', 'g1', 'i1', ['r1'])).rejects.toThrow('banco caiu');
    });
  });

  describe('cancel', () => {
    it('404 quando a sessão não é da congregação', async () => {
      const client = clientWith();
      client.kidsSession.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).cancel('t1', 'g1', 's1')).rejects.toBeInstanceOf(NotFoundException);
      expect(client.kidsSession.findFirst).toHaveBeenCalledWith({
        where: { id: 's1', tenant_id: 't1', congregation_id: 'g1' },
      });
    });

    it('422 com check-in aberto, e não cancela', async () => {
      const client = clientWith();
      client.kidsSession.findFirst.mockResolvedValue({ id: 's1', status: 'open' });
      client.kidsCheckin.count.mockResolvedValue(2);
      await expect(serviceWith(client).cancel('t1', 'g1', 's1')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
      expect(client.kidsCheckin.count).toHaveBeenCalledWith({
        where: { session_id: 's1', checked_out_at: null },
      });
      expect(client.kidsSession.update).not.toHaveBeenCalled();
    });

    it('cancela quando não há criança presente', async () => {
      const client = clientWith();
      client.kidsSession.findFirst.mockResolvedValue({ id: 's1', status: 'open' });
      client.kidsCheckin.count.mockResolvedValue(0);
      client.kidsSession.update.mockResolvedValue({ id: 's1', status: 'cancelled' });

      const out = await serviceWith(client).cancel('t1', 'g1', 's1');

      expect(client.kidsSession.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { status: 'cancelled' } });
      expect(out.status).toBe('cancelled');
    });

    it('sessão já cancelada volta como está (idempotente)', async () => {
      const client = clientWith();
      client.kidsSession.findFirst.mockResolvedValue({ id: 's1', status: 'cancelled' });
      const out = await serviceWith(client).cancel('t1', 'g1', 's1');
      expect(out.status).toBe('cancelled');
      expect(client.kidsSession.update).not.toHaveBeenCalled();
    });
  });
});
