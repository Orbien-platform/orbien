import { BalanceteService } from './balancete.service';
import { PrismaService } from '../prisma/prisma.service';
import { DreService } from './dre.service';
import { Decimal } from '@prisma/client/runtime/library';

function serviceWith(transactions: unknown[]) {
  const client = {
    financialTransaction: {
      findMany: jest.fn().mockResolvedValue(transactions),
    },
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new BalanceteService(prisma), client };
}

describe('BalanceteService', () => {
  it('agrupa transações por centro de custo, somando receita e despesa', async () => {
    const { service, client } = serviceWith([
      {
        amount: 100,
        category: { type: 'income' },
        costCenter: { id: 'cc1', name: 'Missões' },
      },
      {
        amount: 40,
        category: { type: 'expense' },
        costCenter: { id: 'cc1', name: 'Missões' },
      },
      {
        amount: 30,
        category: { type: 'income' },
        costCenter: { id: 'cc2', name: 'Templo' },
      },
    ]);

    const result = await service.build('tenant-1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });

    expect(client.financialTransaction.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: 'tenant-1',
        occurred_at: { gte: new Date('2026-01-01'), lte: expect.any(Date) },
        status: { in: ['paid', 'confirmed'] },
      },
      include: {
        category: { select: { type: true } },
        costCenter: { select: { id: true, name: true } },
      },
    });

    expect(result.revenue_total).toBe(130);
    expect(result.expenses_total).toBe(40);
    expect(result.net_result).toBe(90);
    expect(result.lines).toHaveLength(2);

    const missoes = result.lines.find((l) => l.cost_center_id === 'cc1')!;
    expect(missoes.revenue_total).toBe(100);
    expect(missoes.expenses_total).toBe(40);
    expect(missoes.net_result).toBe(60);
    expect(missoes.count).toBe(2);
  });

  it('agrupa transações sem centro de custo sob "Sem centro de custo"', async () => {
    const { service } = serviceWith([
      { amount: 50, category: { type: 'income' }, costCenter: null },
    ]);

    const result = await service.build('tenant-1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });

    expect(result.lines).toEqual([
      {
        cost_center_id: null,
        cost_center_name: 'Sem centro de custo',
        revenue_total: 50,
        expenses_total: 0,
        net_result: 50,
        count: 1,
      },
    ]);
  });

  it('filtra por congregação quando informado', async () => {
    const { service, client } = serviceWith([]);

    await service.build('tenant-1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      congregation_id: 'cong-1',
    });

    expect(client.financialTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ congregation_id: 'cong-1' }),
      }),
    );
  });

  it('lista vazia devolve totais zerados', async () => {
    const { service } = serviceWith([]);

    const result = await service.build('tenant-1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });

    expect(result.lines).toEqual([]);
    expect(result.revenue_total).toBe(0);
    expect(result.expenses_total).toBe(0);
    expect(result.net_result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Só realizados e fechamento com o DRE (T4 · DRE-16). O fake aplica o `where`
// (status, período, centro) como o banco faria.
// ---------------------------------------------------------------------------

type Row = {
  amount: Decimal;
  status: 'pending' | 'paid' | 'confirmed';
  occurred_at: Date;
  cost_center_id: string | null;
  category: { name: string; type: string };
  costCenter: { id: string; name: string } | null;
};

const CC_A = { id: 'cc-a', name: 'Missões' };
const CC_B = { id: 'cc-b', name: 'Templo' };

function row(
  amount: string,
  type: 'income' | 'expense',
  status: Row['status'],
  cc: { id: string; name: string } | null,
  date = '2026-01-10',
): Row {
  return {
    amount: new Decimal(amount),
    status,
    occurred_at: new Date(`${date}T12:00:00.000Z`),
    cost_center_id: cc?.id ?? null,
    category: { name: type === 'income' ? 'Dízimos' : 'Aluguel', type },
    costCenter: cc,
  };
}

function prismaWith(rows: Row[]) {
  return {
    client: {
      financialTransaction: {
        findMany: (args: {
          where: { occurred_at: { gte: Date; lte: Date }; status?: { in: string[] } };
        }) =>
          Promise.resolve(
            rows.filter(
              (r) =>
                r.occurred_at >= args.where.occurred_at.gte &&
                r.occurred_at <= args.where.occurred_at.lte &&
                (args.where.status === undefined || args.where.status.in.includes(r.status)),
            ),
          ),
      },
    },
  } as unknown as PrismaService;
}

describe('BalanceteService — só lançamentos realizados', () => {
  const periodo = { period_start: '2026-01-01', period_end: '2026-01-31' };

  const rows = [
    row('100.00', 'income', 'paid', CC_A),
    row('40.00', 'expense', 'confirmed', CC_A),
    row('30.00', 'income', 'confirmed', null),
    // pendentes: não podem aparecer em linha nem em total
    row('999.00', 'income', 'pending', CC_A),
    row('888.00', 'expense', 'pending', CC_B),
    row('777.00', 'income', 'pending', null),
  ];

  it('pending não entra nas linhas nem nos totais', async () => {
    const service = new BalanceteService(prismaWith(rows));

    const result = await service.build('t1', periodo);

    expect(result.revenue_total).toBe(130);
    expect(result.expenses_total).toBe(40);
    expect(result.net_result).toBe(90);
    // CC_B só tinha lançamento pendente: nem aparece como linha.
    expect(result.lines.map((l) => l.cost_center_id)).toHaveLength(2);
    expect(result.lines.map((l) => l.cost_center_id)).toEqual(expect.arrayContaining([null, 'cc-a']));
    const missoes = result.lines.find((l) => l.cost_center_id === 'cc-a')!;
    expect(missoes).toMatchObject({ revenue_total: 100, expenses_total: 40, net_result: 60, count: 2 });
  });

  it('net_result do Balancete = net_result do DRE para o mesmo conjunto de lançamentos', async () => {
    const prisma = prismaWith(rows);

    const balancete = await new BalanceteService(prisma).build('t1', periodo);
    const dre = await new DreService(prisma).buildDre('t1', 'c1', periodo, false);

    expect(balancete.net_result).toBe(dre.net_result);
    expect(balancete.revenue_total).toBe(dre.revenue.total);
    expect(balancete.expenses_total).toBe(dre.expenses.total);
  });

  it('0,10 + 0,20 − 0,30 → net_result 0 (mesmo arredondamento do DRE)', async () => {
    const service = new BalanceteService(
      prismaWith([
        row('0.10', 'income', 'paid', CC_A),
        row('0.20', 'income', 'paid', CC_A),
        row('0.30', 'expense', 'paid', CC_A),
      ]),
    );

    const result = await service.build('t1', periodo);

    expect(result.net_result).toBe(0);
    expect(result.lines[0]?.net_result).toBe(0);
  });
});
