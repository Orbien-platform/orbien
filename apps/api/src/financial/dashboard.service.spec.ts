/**
 * `getWeeklyDashboard` faz cinco idas ao banco, quatro delas com
 * `$queryRaw` — e `$queryRaw` não se testa com mock (ver docs/TESTES.md).
 * Esta suíte mocka `$queryRaw` só para exercitar a ARITMÉTICA que o método
 * faz em cima do retorno (preenchimento dos baldes do período, `vs_previous_pct`,
 * mapeamento de categoria, média por contribuinte, contagem de dizimistas) —
 * não a correção do SQL. A correção do SQL é responsabilidade de
 * `test/integration/dashboard.integration.spec.ts`, que roda contra o
 * Postgres de verdade.
 */

import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

type Setup = {
  seriesRows?: unknown[];
  topRaw?: { category_id: string; total: unknown }[];
  contribRow?: { total: unknown; donor_count: bigint };
  titheRow?: { count: bigint };
  curIncSum?: unknown;
  curExpSum?: unknown;
  lastIncSum?: unknown;
  dizimoCategory?: { id: string } | null;
  categories?: { id: string; name: string }[];
};

function serviceWith(opts: Setup = {}) {
  const {
    seriesRows = [],
    topRaw = [],
    contribRow = { total: 0, donor_count: 0n },
    titheRow = { count: 0n },
    curIncSum = null,
    curExpSum = null,
    lastIncSum = null,
    dizimoCategory = null,
    categories = [],
  } = opts;

  // $queryRaw é chamado 3 ou 4 vezes por execução, sempre na mesma ordem:
  // série, top categorias, média por contribuinte, e (condicional) dízimo.
  const queryRawCalls: unknown[][] = [seriesRows, topRaw, [contribRow]];
  if (dizimoCategory) queryRawCalls.push([titheRow]);
  let queryRawCallIndex = 0;

  const client = {
    $queryRaw: jest.fn(() => Promise.resolve(queryRawCalls[queryRawCallIndex++] ?? [])),
    financialTransaction: {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce({ _sum: { amount: curIncSum } })
        .mockResolvedValueOnce({ _sum: { amount: curExpSum } })
        .mockResolvedValueOnce({ _sum: { amount: lastIncSum } }),
    },
    financialCategory: {
      findMany: jest.fn().mockResolvedValue(categories),
      findFirst: jest.fn().mockResolvedValue(dizimoCategory),
    },
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new DashboardService(prisma), client };
}

describe('DashboardService.getWeeklyDashboard', () => {
  const OCT = ['2026-10-01', '2026-10-31'] as const;

  it('sem período, usa o mês corrente de Brasília e agrupa por semana', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    try {
      const { service } = serviceWith();
      const result = await service.getWeeklyDashboard(user);

      expect(result.period).toEqual({ start: '2026-10-01', end: '2026-10-31', granularity: 'week' });
      // 1º/10/2026 é quinta: semanas de 28/09, 05, 12, 19 e 26/10.
      expect(result.series).toHaveLength(5);
      expect(result.series.every((w) => w.income === 0 && w.expense === 0 && w.net === 0)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('recorta o primeiro e o último balde no período escolhido', async () => {
    const { service } = serviceWith();
    const result = await service.getWeeklyDashboard(user, ...OCT);

    expect(result.series[0]).toMatchObject({ start: '2026-10-01', end: '2026-10-04' });
    expect(result.series[4]).toMatchObject({ start: '2026-10-26', end: '2026-10-31' });
  });

  it('preenche o balde correspondente quando o banco devolve uma linha', async () => {
    const { service } = serviceWith({
      seriesRows: [{ bucket_start: new Date('2026-10-12T00:00:00.000Z'), income: '100.50', expense: '20' }],
    });

    const result = await service.getWeeklyDashboard(user, ...OCT);
    expect(result.series[2]).toMatchObject({ start: '2026-10-12', income: 100.5, expense: 20, net: 80.5 });
    expect(result.series[1]).toMatchObject({ income: 0, expense: 0 });
  });

  it('período de ano agrupa por mês, com 12 baldes', async () => {
    const { service } = serviceWith();
    const result = await service.getWeeklyDashboard(user, '2026-01-01', '2026-12-31');

    expect(result.period.granularity).toBe('month');
    expect(result.series).toHaveLength(12);
    expect(result.series[0]).toMatchObject({ start: '2026-01-01', end: '2026-01-31' });
  });

  it('consulta o período com limite superior exclusivo no dia seguinte', async () => {
    const { service, client } = serviceWith();
    await service.getWeeklyDashboard(user, ...OCT);

    const incomeWhere = client.financialTransaction.aggregate.mock.calls[0]![0].where;
    expect(incomeWhere.occurred_at.gte.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(incomeWhere.occurred_at.lt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });

  it('compara mês cheio com o mês anterior, não com os 31 dias antes', async () => {
    const { service, client } = serviceWith();
    await service.getWeeklyDashboard(user, ...OCT);

    const prevWhere = client.financialTransaction.aggregate.mock.calls[2]![0].where;
    expect(prevWhere.occurred_at.gte.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(prevWhere.occurred_at.lt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('rejeita período invertido, incompleto ou acima do limite com 400', async () => {
    const { service } = serviceWith();
    await expect(service.getWeeklyDashboard(user, '2026-10-31', '2026-10-01')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.getWeeklyDashboard(user, '2026-10-01')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.getWeeklyDashboard(user, '2000-01-01', '2026-01-01')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.getWeeklyDashboard(user, '2026-02-30', '2026-03-10')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('vs_previous_pct é null quando não há receita no período anterior', async () => {
    const { service } = serviceWith({ lastIncSum: null });

    const result = await service.getWeeklyDashboard(user);
    expect(result.totals.vs_previous_pct).toBeNull();
  });

  it('vs_previous_pct calcula a variação percentual quando há período anterior', async () => {
    const { service } = serviceWith({ curIncSum: '150', lastIncSum: '100' });

    const result = await service.getWeeklyDashboard(user);
    expect(result.totals.vs_previous_pct).toBe(50);
    expect(result.totals.income).toBe(150);
  });

  it('totals.net é a diferença entre receita e despesa do período', async () => {
    const { service } = serviceWith({ curIncSum: '300', curExpSum: '120' });

    const result = await service.getWeeklyDashboard(user);
    expect(result.totals.net).toBe(180);
  });

  it('top_income_categories vazio quando não há categoria com receita no período', async () => {
    const { service, client } = serviceWith({ topRaw: [] });

    const result = await service.getWeeklyDashboard(user);
    expect(result.top_income_categories).toEqual([]);
    expect(client.financialCategory.findMany).not.toHaveBeenCalled();
  });

  it('mapeia category_id para o nome real quando encontrado', async () => {
    const { service } = serviceWith({
      topRaw: [{ category_id: 'cat-1', total: '200' }],
      categories: [{ id: 'cat-1', name: 'Dízimos' }],
    });

    const result = await service.getWeeklyDashboard(user);
    expect(result.top_income_categories).toEqual([{ category_name: 'Dízimos', total: 200 }]);
  });

  it('usa o próprio id como nome quando a categoria não é encontrada', async () => {
    const { service } = serviceWith({
      topRaw: [{ category_id: 'cat-orfa', total: '50' }],
      categories: [],
    });

    const result = await service.getWeeklyDashboard(user);
    expect(result.top_income_categories).toEqual([{ category_name: 'cat-orfa', total: 50 }]);
  });

  it('average_per_contributor é zero quando não há doador distinto', async () => {
    const { service } = serviceWith({ contribRow: { total: '500', donor_count: 0n } });

    const result = await service.getWeeklyDashboard(user);
    expect(result.average_per_contributor).toBe(0);
  });

  it('average_per_contributor divide o total pelo número de doadores', async () => {
    const { service } = serviceWith({ contribRow: { total: '500', donor_count: 5n } });

    const result = await service.getWeeklyDashboard(user);
    expect(result.average_per_contributor).toBe(100);
  });

  it('tithe_active_count fica zero quando não existe categoria "Dízimo"', async () => {
    const { service, client } = serviceWith({ dizimoCategory: null });

    const result = await service.getWeeklyDashboard(user);
    expect(result.tithe_active_count).toBe(0);
    // Só 3 chamadas de $queryRaw: série, top categorias, contribuinte —
    // a quarta (dízimo) não roda porque a categoria não existe.
    expect(client.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it('tithe_active_count consulta e conta quando existe categoria "Dízimo"', async () => {
    const { service, client } = serviceWith({
      dizimoCategory: { id: 'cat-dizimo' },
      titheRow: { count: 7n },
    });

    const result = await service.getWeeklyDashboard(user);
    expect(result.tithe_active_count).toBe(7);
    expect(client.$queryRaw).toHaveBeenCalledTimes(4);
  });
});

describe('DashboardService.getCashBalance', () => {
  type Group = { type: 'income' | 'expense'; status: 'pending' | 'paid' | 'confirmed'; _sum: { amount: unknown } };

  function cashService(groups: Group[]) {
    const groupBy = jest.fn().mockResolvedValue(groups);
    const prisma = { client: { financialTransaction: { groupBy } } } as unknown as PrismaService;
    return { service: new DashboardService(prisma), groupBy };
  }

  it('o caixa soma entradas e saídas pagas e exportadas, e deixa o não pago de fora', async () => {
    const { service } = cashService([
      { type: 'income', status: 'paid', _sum: { amount: '1000.50' } },
      { type: 'income', status: 'confirmed', _sum: { amount: '500' } },
      { type: 'expense', status: 'paid', _sum: { amount: '300.25' } },
      { type: 'expense', status: 'confirmed', _sum: { amount: '100' } },
      { type: 'income', status: 'pending', _sum: { amount: '999' } },
      { type: 'expense', status: 'pending', _sum: { amount: '77' } },
    ]);
    const result = await service.getCashBalance(user, '2026-10-31');
    expect(result.as_of).toBe('2026-10-31');
    expect(result.balance).toBeCloseTo(1100.25, 2);
    expect(result.pending).toEqual({ income: 999, expense: 77 });
  });

  it('sem nenhum lançamento, o caixa é zero', async () => {
    const { service } = cashService([]);
    const result = await service.getCashBalance(user, '2026-10-31');
    expect(result.balance).toBe(0);
    expect(result.pending).toEqual({ income: 0, expense: 0 });
  });

  it('saída maior que entrada dá caixa negativo', async () => {
    const { service } = cashService([
      { type: 'income', status: 'paid', _sum: { amount: '100' } },
      { type: 'expense', status: 'paid', _sum: { amount: '250' } },
    ]);
    const result = await service.getCashBalance(user, '2026-10-31');
    expect(result.balance).toBe(-150);
  });

  it('consulta a congregação do usuário, desde sempre até o fim do dia pedido (exclusivo)', async () => {
    const { service, groupBy } = cashService([]);
    await service.getCashBalance(user, '2026-10-31');
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          occurred_at: { lt: new Date('2026-11-01T00:00:00.000Z') },
        },
      }),
    );
  });

  it('sem as_of, usa hoje em Brasília', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    try {
      const { service } = cashService([]);
      const result = await service.getCashBalance(user);
      expect(result.as_of).toBe('2026-10-15');
    } finally {
      jest.useRealTimers();
    }
  });

  it('data impossível vira 400', async () => {
    const { service } = cashService([]);
    await expect(service.getCashBalance(user, '2026-02-30')).rejects.toBeInstanceOf(BadRequestException);
  });
});
