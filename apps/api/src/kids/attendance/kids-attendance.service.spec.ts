import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { KidsAttendanceService } from './kids-attendance.service';
import { PrismaService } from '../../prisma/prisma.service';

function clientWith() {
  return {
    congregation: { findFirst: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) },
    kidsRoom: { findFirst: jest.fn() },
    kidsCheckin: { findMany: jest.fn().mockResolvedValue([]) },
  };
}
const serviceWith = (client: ReturnType<typeof clientWith>) =>
  new KidsAttendanceService({ client } as unknown as PrismaService);

// 26/10/2026 15:00 em Brasília.
const NOW = new Date('2026-10-26T18:00:00.000Z');

/** Linha como o banco devolve (distinct por sessão e criança). */
const row = (session: string, child: string, room: string, roomName = room.toUpperCase()) => ({
  session_id: session,
  child_id: child,
  session: { room_id: room, room: { id: room, name: roomName } },
});

describe('KidsAttendanceService.summary (spec P3, AC 1 e 2)', () => {
  describe('média por turma só entre sessões com check-in (AC 1)', () => {
    it('média = crianças distintas por sessão, somadas e divididas pelas sessões com check-in da turma', async () => {
      const client = clientWith();
      client.kidsCheckin.findMany.mockResolvedValue([
        // Maternal: sessão s1 com 3 crianças, s2 com 2 => média 2,5
        row('s1', 'c1', 'rA', 'Maternal'), row('s1', 'c2', 'rA', 'Maternal'), row('s1', 'c3', 'rA', 'Maternal'),
        row('s2', 'c1', 'rA', 'Maternal'), row('s2', 'c2', 'rA', 'Maternal'),
        // Bebês: uma sessão com 1 criança => média 1
        row('s3', 'c9', 'rB', 'Bebês'),
      ]);

      const out = await serviceWith(client).summary('t1', 'g1', {}, NOW);

      expect(out.rooms).toEqual([
        { room_id: 'rB', room_name: 'Bebês', sessions_counted: 1, total_children: 1, average_children: 1 },
        { room_id: 'rA', room_name: 'Maternal', sessions_counted: 2, total_children: 5, average_children: 2.5 },
      ]);
      expect(out.sessions_counted).toBe(3);
    });

    it('sessão sem check-in não entra na conta (a consulta só devolve quem tem check-in)', async () => {
      const client = clientWith();
      // s2 teve sessão aberta mas nenhum check-in: não aparece nas linhas, então não puxa a média para baixo.
      client.kidsCheckin.findMany.mockResolvedValue([row('s1', 'c1', 'rA', 'Maternal'), row('s1', 'c2', 'rA', 'Maternal')]);

      const out = await serviceWith(client).summary('t1', 'g1', {}, NOW);

      expect(out.rooms[0]).toMatchObject({ sessions_counted: 1, average_children: 2 });
    });

    it('média com uma casa decimal', async () => {
      const client = clientWith();
      client.kidsCheckin.findMany.mockResolvedValue([
        row('s1', 'c1', 'rA'), row('s1', 'c2', 'rA'),
        row('s2', 'c1', 'rA'),
        row('s3', 'c1', 'rA'),
      ]);
      const out = await serviceWith(client).summary('t1', 'g1', {}, NOW);
      expect(out.rooms[0]!.average_children).toBe(1.3); // 4/3
    });

    it('a mesma criança em duas sessões da turma conta em cada sessão; a repetida na mesma sessão, uma vez', async () => {
      const client = clientWith();
      // O banco já devolve distinct (session, child); duplicata aqui prova a defesa em memória.
      client.kidsCheckin.findMany.mockResolvedValue([
        row('s1', 'c1', 'rA'), row('s1', 'c1', 'rA'), row('s2', 'c1', 'rA'),
      ]);
      const out = await serviceWith(client).summary('t1', 'g1', {}, NOW);
      expect(out.rooms[0]).toMatchObject({ sessions_counted: 2, total_children: 2, average_children: 1 });
    });

    it('turmas ordenadas por nome', async () => {
      const client = clientWith();
      client.kidsCheckin.findMany.mockResolvedValue([row('s1', 'c1', 'r2', 'Zeta'), row('s2', 'c1', 'r1', 'Alfa')]);
      const out = await serviceWith(client).summary('t1', 'g1', {}, NOW);
      expect(out.rooms.map((r) => r.room_name)).toEqual(['Alfa', 'Zeta']);
    });
  });

  describe('estado vazio, nunca zero (AC 2)', () => {
    it('nenhuma sessão com check-in no filtro: estrutura vazia, sem média', async () => {
      const client = clientWith();
      client.kidsCheckin.findMany.mockResolvedValue([]);

      const out = await serviceWith(client).summary('t1', 'g1', {}, NOW);

      expect(out.rooms).toEqual([]);
      expect(out.sessions_counted).toBe(0);
      expect(JSON.stringify(out)).not.toContain('average_children');
    });

    it('turma filtrada sem check-in também devolve vazio', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue({ id: 'rA' });
      const out = await serviceWith(client).summary('t1', 'g1', { room_id: 'rA' }, NOW);
      expect(out.rooms).toEqual([]);
    });
  });

  describe('período', () => {
    it('padrão de 90 dias terminando hoje no fuso da congregação', async () => {
      const client = clientWith();
      const out = await serviceWith(client).summary('t1', 'g1', {}, NOW);

      expect(out.period).toEqual({ date_from: '2026-07-29', date_to: '2026-10-26' });
      const where = client.kidsCheckin.findMany.mock.calls[0][0].where;
      expect(where.session.celebrationInstance.scheduled_date).toEqual({
        gte: new Date('2026-07-29T00:00:00.000Z'),
        lte: new Date('2026-10-26T00:00:00.000Z'),
      });
    });

    it('"hoje" segue o fuso: 01h UTC de 27/10 ainda é 26/10 em Brasília', async () => {
      const client = clientWith();
      const out = await serviceWith(client).summary('t1', 'g1', {}, new Date('2026-10-27T01:00:00.000Z'));
      expect(out.period.date_to).toBe('2026-10-26');
    });

    it('sem a congregação na base cai no fuso de Brasília', async () => {
      const client = clientWith();
      client.congregation.findFirst.mockResolvedValue(null);
      const out = await serviceWith(client).summary('t1', 'g1', {}, new Date('2026-10-27T01:00:00.000Z'));
      expect(out.period.date_to).toBe('2026-10-26');
    });

    it('só date_from: vai até hoje', async () => {
      const out = await serviceWith(clientWith()).summary('t1', 'g1', { date_from: '2026-10-01' }, NOW);
      expect(out.period).toEqual({ date_from: '2026-10-01', date_to: '2026-10-26' });
    });

    it('só date_to: 90 dias antes dele', async () => {
      const out = await serviceWith(clientWith()).summary('t1', 'g1', { date_to: '2026-06-30' }, NOW);
      expect(out.period).toEqual({ date_from: '2026-04-02', date_to: '2026-06-30' });
    });

    it('período informado vale como veio', async () => {
      const out = await serviceWith(clientWith()).summary(
        't1', 'g1', { date_from: '2026-01-01', date_to: '2026-03-31' }, NOW,
      );
      expect(out.period).toEqual({ date_from: '2026-01-01', date_to: '2026-03-31' });
    });

    it('422 quando o início é depois do fim', async () => {
      const client = clientWith();
      await expect(
        serviceWith(client).summary('t1', 'g1', { date_from: '2026-10-02', date_to: '2026-10-01' }, NOW),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(client.kidsCheckin.findMany).not.toHaveBeenCalled();
    });

    it('aceita início igual ao fim (um dia só)', async () => {
      const out = await serviceWith(clientWith()).summary(
        't1', 'g1', { date_from: '2026-10-01', date_to: '2026-10-01' }, NOW,
      );
      expect(out.period).toEqual({ date_from: '2026-10-01', date_to: '2026-10-01' });
    });
  });

  describe('filtros e escopo', () => {
    it('consulta check-ins do tenant e congregação, em culto não cancelado, distintos por sessão e criança', async () => {
      const client = clientWith();
      await serviceWith(client).summary('t1', 'g1', {}, NOW);

      expect(client.kidsCheckin.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 't1',
          congregation_id: 'g1',
          session: {
            celebrationInstance: {
              status: { not: 'cancelled' },
              scheduled_date: { gte: expect.any(Date), lte: expect.any(Date) },
            },
          },
        },
        select: {
          session_id: true,
          child_id: true,
          session: { select: { room_id: true, room: { select: { id: true, name: true } } } },
        },
        distinct: ['session_id', 'child_id'],
      });
    });

    it('room_id filtra a turma e a confirma na congregação (404 se não existe)', async () => {
      const client = clientWith();
      client.kidsRoom.findFirst.mockResolvedValue({ id: 'rA' });
      await serviceWith(client).summary('t1', 'g1', { room_id: 'rA' }, NOW);

      expect(client.kidsRoom.findFirst).toHaveBeenCalledWith({
        where: { id: 'rA', tenant_id: 't1', congregation_id: 'g1' },
        select: { id: true },
      });
      expect(client.kidsCheckin.findMany.mock.calls[0][0].where.session.room_id).toBe('rA');

      client.kidsRoom.findFirst.mockResolvedValue(null);
      await expect(serviceWith(client).summary('t1', 'g1', { room_id: 'x' }, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
