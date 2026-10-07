/**
 * Evolução mensal por centro de custo (T6 · DRE-17): um ponto por mês de
 * calendário que o período toca, zeros nos meses sem lançamento, máximo de 36
 * meses (acima disso 400), mesma regra de status do DRE/Balancete.
 */
import { BadRequestException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceteService } from './balancete.service';
import { BalanceteMonthlyService } from './balancete-monthly.service';

type Row = {
  amount: Decimal;
  status: 'pending' | 'paid' | 'confirmed';
  occurred_at: Date;
  category: { type: string; name?: string };
  costCenter: { id: string; name: string } | null;
};

const MISSOES = { id: 'cc-missoes', name: 'Missões' };
const TEMPLO = { id: 'cc-templo', name: 'Templo' };

function row(
  amount: string,
  type: 'income' | 'expense',
  date: string,
  cc: { id: string; name: string } | null,
  status: Row['status'] = 'paid',
): Row {
  return {
    amount: new Decimal(amount),
    status,
    occurred_at: new Date(`${date}T12:00:00.000Z`),
    category: { type },
    costCenter: cc,
  };
}

function prismaWith(rows: Row[]) {
  const wheres: Record<string, unknown>[] = [];
  const prisma = {
    client: {
      financialTransaction: {
        findMany: (args: {
          where: {
            occurred_at: { gte: Date; lte: Date };
            status?: { in: string[] };
            congregation_id?: string;
          };
        }) => {
          wheres.push(args.where);
          const w = args.where;
          return Promise.resolve(
            rows.filter(
              (r) =>
                r.occurred_at >= w.occurred_at.gte &&
                r.occurred_at <= w.occurred_at.lte &&
                (w.status === undefined || w.status.in.includes(r.status)),
            ),
          );
        },
      },
    },
  } as unknown as PrismaService;
  return { prisma, wheres };
}

const trimestre = { period_start: '2026-01-01', period_end: '2026-03-31' };

describe('BalanceteMonthlyService.build', () => {
  it('um ponto por mês do período, com zeros nos meses sem lançamento', async () => {
    const { prisma } = prismaWith([
      row('100.00', 'income', '2026-01-10', MISSOES),
      row('30.00', 'expense', '2026-01-20', MISSOES),
      row('70.00', 'income', '2026-03-05', MISSOES),
    ]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', trimestre);

    expect(result.period).toEqual({ start: '2026-01-01', end: '2026-03-31' });
    expect(result.months).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(result.series).toEqual([
      {
        cost_center_id: 'cc-missoes',
        name: 'Missões',
        points: [
          { month: '2026-01', revenue_total: 100, expenses_total: 30, net_result: 70 },
          { month: '2026-02', revenue_total: 0, expenses_total: 0, net_result: 0 },
          { month: '2026-03', revenue_total: 70, expenses_total: 0, net_result: 70 },
        ],
      },
    ]);
  });

  it('período que não fecha os meses toca todos os meses de calendário envolvidos', async () => {
    const { prisma } = prismaWith([
      row('10.00', 'income', '2026-01-20', MISSOES),
      row('20.00', 'income', '2026-02-05', MISSOES),
    ]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', {
      period_start: '2026-01-15',
      period_end: '2026-02-10',
    });

    expect(result.months).toEqual(['2026-01', '2026-02']);
    expect(result.series[0]?.points.map((p) => p.revenue_total)).toEqual([10, 20]);
  });

  it('a série atravessa a virada de ano', async () => {
    const { prisma } = prismaWith([row('10.00', 'income', '2026-01-02', MISSOES)]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', {
      period_start: '2025-11-01',
      period_end: '2026-01-31',
    });

    expect(result.months).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('inclui "Sem centro de custo" como série, por último', async () => {
    const { prisma } = prismaWith([
      row('5.00', 'income', '2026-01-10', null),
      row('9.00', 'income', '2026-01-10', TEMPLO),
      row('4.00', 'income', '2026-01-10', MISSOES),
    ]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', trimestre);

    expect(result.series.map((s) => [s.cost_center_id, s.name])).toEqual([
      ['cc-missoes', 'Missões'],
      ['cc-templo', 'Templo'],
      [null, 'Sem centro de custo'],
    ]);
    expect(result.series[2]?.points[0]).toEqual({
      month: '2026-01',
      revenue_total: 5,
      expenses_total: 0,
      net_result: 5,
    });
  });

  it('pending fica fora da série (mesma regra do DRE)', async () => {
    const { prisma } = prismaWith([
      row('10.00', 'income', '2026-01-10', MISSOES),
      row('999.00', 'income', '2026-01-11', MISSOES, 'pending'),
      row('500.00', 'income', '2026-01-12', TEMPLO, 'pending'),
    ]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', trimestre);

    expect(result.series.map((s) => s.cost_center_id)).toEqual(['cc-missoes']);
    expect(result.series[0]?.points[0]?.revenue_total).toBe(10);
  });

  it('soma dos meses de cada centro = total do centro no Balancete do mesmo período', async () => {
    const rows = [
      row('100.10', 'income', '2026-01-10', MISSOES),
      row('0.20', 'income', '2026-02-10', MISSOES),
      row('30.30', 'expense', '2026-03-10', MISSOES),
      row('200.00', 'income', '2026-02-11', TEMPLO),
      row('7.77', 'expense', '2026-01-31', null),
      row('1.00', 'income', '2026-03-31', null),
    ];
    const { prisma } = prismaWith(rows);

    const monthly = await new BalanceteMonthlyService(prisma).build('t1', trimestre);
    const balancete = await new BalanceteService(prisma).build('t1', trimestre);

    expect(monthly.series).toHaveLength(balancete.lines.length);
    for (const line of balancete.lines) {
      const serie = monthly.series.find((s) => s.cost_center_id === line.cost_center_id)!;
      const round = (n: number) => Math.round(n * 100) / 100;
      expect(round(serie.points.reduce((s, p) => s + p.revenue_total, 0))).toBe(line.revenue_total);
      expect(round(serie.points.reduce((s, p) => s + p.expenses_total, 0))).toBe(line.expenses_total);
      expect(round(serie.points.reduce((s, p) => s + p.net_result, 0))).toBe(line.net_result);
    }
  });

  it('0,10 + 0,20 − 0,30 no mesmo mês → net_result 0', async () => {
    const { prisma } = prismaWith([
      row('0.10', 'income', '2026-01-05', MISSOES),
      row('0.20', 'income', '2026-01-06', MISSOES),
      row('0.30', 'expense', '2026-01-07', MISSOES),
    ]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });

    expect(result.series[0]?.points[0]?.net_result).toBe(0);
  });

  it('sem lançamentos: meses preenchidos e nenhuma série', async () => {
    const { prisma } = prismaWith([]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', trimestre);

    expect(result.months).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(result.series).toEqual([]);
  });

  it('exatamente 36 meses é aceito', async () => {
    const { prisma } = prismaWith([]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', {
      period_start: '2024-01-01',
      period_end: '2026-12-31',
    });

    expect(result.months).toHaveLength(36);
    expect(result.months[0]).toBe('2024-01');
    expect(result.months[35]).toBe('2026-12');
  });

  it('37 meses → 400, sem consultar o banco', async () => {
    const { prisma, wheres } = prismaWith([]);

    const run = new BalanceteMonthlyService(prisma).build('t1', {
      period_start: '2024-01-01',
      period_end: '2027-01-31',
    });

    await expect(run).rejects.toBeInstanceOf(BadRequestException);
    await expect(run).rejects.toThrow('36 meses');
    expect(wheres).toHaveLength(0);
  });

  it('36 meses de calendário contados pelos meses tocados, não por dias (31/12 a 01/01 = 2)', async () => {
    const { prisma } = prismaWith([]);

    const result = await new BalanceteMonthlyService(prisma).build('t1', {
      period_start: '2025-12-31',
      period_end: '2026-01-01',
    });

    expect(result.months).toEqual(['2025-12', '2026-01']);
  });

  it('consulta dentro do tenant, com o recorte de congregação e o último dia inteiro', async () => {
    const { prisma, wheres } = prismaWith([]);

    await new BalanceteMonthlyService(prisma).build('tenant-abc', {
      ...trimestre,
      congregation_id: 'cong-1',
    });

    expect(wheres[0]?.['tenant_id']).toBe('tenant-abc');
    expect(wheres[0]?.['congregation_id']).toBe('cong-1');
    expect((wheres[0]?.['occurred_at'] as { lte: Date }).lte.toISOString()).toBe(
      '2026-03-31T23:59:59.999Z',
    );
  });
});
