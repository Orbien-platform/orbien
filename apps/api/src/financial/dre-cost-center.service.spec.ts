/**
 * DRE comparativo por centro de custo (T5 · DRE-13). O contrato de fechamento
 * da spec: soma das colunas = total geral = `net_result` do `GET /financial/dre`
 * para o mesmo período/conjunto. O fake aplica o `where` (status, período,
 * congregação) como o banco faria, para os testes afirmarem o RESULTADO.
 */
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { DreService } from './dre.service';
import { BalanceteService } from './balancete.service';
import { BalanceteMonthlyService } from './balancete-monthly.service';
import { DreCostCenterService, NONE_KEY } from './dre-cost-center.service';

type Row = {
  amount: Decimal;
  status: 'pending' | 'paid' | 'confirmed';
  occurred_at: Date;
  congregation_id: string;
  category: { name: string; type: string };
  costCenter: { id: string; name: string } | null;
};

const MISSOES = { id: 'cc-missoes', name: 'Missões' };
const TEMPLO = { id: 'cc-templo', name: 'Templo' };

function row(
  amount: string,
  type: 'income' | 'expense',
  category: string,
  cc: { id: string; name: string } | null,
  over: Partial<Pick<Row, 'status' | 'occurred_at' | 'congregation_id'>> = {},
): Row {
  return {
    amount: new Decimal(amount),
    status: 'paid',
    occurred_at: new Date('2026-01-10T12:00:00.000Z'),
    congregation_id: 'cong-1',
    category: { name: category, type },
    costCenter: cc,
    ...over,
  };
}

function prismaWith(rows: Row[]) {
  const wheres: Record<string, unknown>[] = [];
  const prisma = {
    client: {
      financialTransaction: {
        findMany: (args: {
          where: {
            tenant_id: string;
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
                (w.status === undefined || w.status.in.includes(r.status)) &&
                (w.congregation_id === undefined || r.congregation_id === w.congregation_id),
            ),
          );
        },
      },
    },
  } as unknown as PrismaService;
  return { prisma, wheres };
}

const periodo = { period_start: '2026-01-01', period_end: '2026-01-31' };

const rows = [
  row('100.00', 'income', 'Dízimos', MISSOES),
  row('50.00', 'income', 'Ofertas', MISSOES),
  row('30.00', 'expense', 'Aluguel', MISSOES),
  row('200.00', 'income', 'Dízimos', TEMPLO),
  row('260.00', 'expense', 'Aluguel', TEMPLO),
  row('10.00', 'expense', 'Água', TEMPLO),
  row('40.00', 'income', 'Dízimos', null),
  row('5.50', 'expense', 'Água', null),
  // pendente e fora do período: não entram
  row('999.00', 'income', 'Dízimos', MISSOES, { status: 'pending' }),
  row('888.00', 'expense', 'Aluguel', TEMPLO, { occurred_at: new Date('2026-02-02T12:00:00.000Z') }),
];

describe('DreCostCenterService.build', () => {
  it('uma coluna por centro com lançamento realizado, mais "Sem centro de custo" ao final', async () => {
    const service = new DreCostCenterService(prismaWith(rows).prisma);

    const dre = await service.build('t1', periodo);

    expect(dre.period).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    expect(dre.columns).toEqual([
      { cost_center_id: 'cc-missoes', name: 'Missões', revenue_total: 150, expenses_total: 30, net_result: 120 },
      { cost_center_id: 'cc-templo', name: 'Templo', revenue_total: 200, expenses_total: 270, net_result: -70 },
      { cost_center_id: null, name: 'Sem centro de custo', revenue_total: 40, expenses_total: 5.5, net_result: 34.5 },
    ]);
  });

  it('não cria coluna "Sem centro de custo" quando todo lançamento tem centro', async () => {
    const service = new DreCostCenterService(
      prismaWith([row('10.00', 'income', 'Dízimos', MISSOES)]).prisma,
    );

    const dre = await service.build('t1', periodo);

    expect(dre.columns.map((c) => c.name)).toEqual(['Missões']);
  });

  it('centro só com lançamento pendente não vira coluna', async () => {
    const service = new DreCostCenterService(
      prismaWith([
        row('10.00', 'income', 'Dízimos', MISSOES),
        row('500.00', 'income', 'Dízimos', TEMPLO, { status: 'pending' }),
      ]).prisma,
    );

    const dre = await service.build('t1', periodo);

    expect(dre.columns.map((c) => c.cost_center_id)).toEqual(['cc-missoes']);
  });

  it('linhas de receita e despesa por categoria, com uma célula por coluna e total da linha', async () => {
    const service = new DreCostCenterService(prismaWith(rows).prisma);

    const dre = await service.build('t1', periodo);

    expect(dre.revenue).toEqual([
      { category_name: 'Dízimos', cells: { 'cc-missoes': 100, 'cc-templo': 200, [NONE_KEY]: 40 }, total: 340 },
      { category_name: 'Ofertas', cells: { 'cc-missoes': 50, 'cc-templo': 0, [NONE_KEY]: 0 }, total: 50 },
    ]);
    expect(dre.expenses).toEqual([
      { category_name: 'Aluguel', cells: { 'cc-missoes': 30, 'cc-templo': 260, [NONE_KEY]: 0 }, total: 290 },
      { category_name: 'Água', cells: { 'cc-missoes': 0, 'cc-templo': 10, [NONE_KEY]: 5.5 }, total: 15.5 },
    ]);
  });

  it('totais gerais: receita, despesa e resultado', async () => {
    const service = new DreCostCenterService(prismaWith(rows).prisma);

    const dre = await service.build('t1', periodo);

    expect(dre.totals).toEqual({ revenue_total: 390, expenses_total: 305.5, net_result: 84.5 });
  });

  it('fecha: soma das colunas = total geral = net_result do buildDre do mesmo período', async () => {
    const { prisma } = prismaWith(rows);

    const matriz = await new DreCostCenterService(prisma).build('t1', periodo);
    const dre = await new DreService(prisma).buildDre('t1', 'c1', periodo, false);

    const somaColunas = matriz.columns.reduce((s, c) => s + c.net_result, 0);
    expect(Math.round(somaColunas * 100) / 100).toBe(matriz.totals.net_result);
    expect(matriz.totals.net_result).toBe(dre.net_result);
    expect(matriz.totals.revenue_total).toBe(dre.revenue.total);
    expect(matriz.totals.expenses_total).toBe(dre.expenses.total);
    // e a soma das células de cada linha fecha com o total da linha
    for (const line of [...matriz.revenue, ...matriz.expenses]) {
      const soma = Object.values(line.cells).reduce((s, v) => s + v, 0);
      expect(Math.round(soma * 100) / 100).toBe(line.total);
    }
  });

  it('0,10 + 0,20 − 0,30 → net_result 0 na coluna e no total', async () => {
    const service = new DreCostCenterService(
      prismaWith([
        row('0.10', 'income', 'A', MISSOES),
        row('0.20', 'income', 'B', MISSOES),
        row('0.30', 'expense', 'C', MISSOES),
      ]).prisma,
    );

    const dre = await service.build('t1', periodo);

    expect(dre.columns[0]?.net_result).toBe(0);
    expect(dre.totals.net_result).toBe(0);
  });

  it('critério de sucesso: a MESMA massa fecha no DRE, na matriz, no Balancete e na série mensal', async () => {
    const { prisma } = prismaWith(rows);

    const dre = await new DreService(prisma).buildDre('t1', 'c1', periodo, false);
    const matriz = await new DreCostCenterService(prisma).build('t1', periodo);
    const balancete = await new BalanceteService(prisma).build('t1', periodo);
    const mensal = await new BalanceteMonthlyService(prisma).build('t1', periodo);

    const somaMensal = (campo: 'revenue_total' | 'expenses_total' | 'net_result') =>
      Math.round(
        mensal.series.flatMap((s) => s.points).reduce((acc, p) => acc + p[campo], 0) * 100,
      ) / 100;

    // massa fixa: 390 de receita, 305,50 de despesa, 84,50 de resultado (pendente e fora do período excluídos)
    for (const r of [
      dre.net_result,
      matriz.totals.net_result,
      balancete.net_result,
      somaMensal('net_result'),
    ]) {
      expect(r).toBe(84.5);
    }
    for (const r of [
      dre.revenue.total,
      matriz.totals.revenue_total,
      balancete.revenue_total,
      somaMensal('revenue_total'),
    ]) {
      expect(r).toBe(390);
    }
    for (const r of [
      dre.expenses.total,
      matriz.totals.expenses_total,
      balancete.expenses_total,
      somaMensal('expenses_total'),
    ]) {
      expect(r).toBe(305.5);
    }
  });

  it('totais gerais em centavos: 0,10 + 0,20 de dois centros → 0,3; net 0,70 − 0,60 → 0,1', async () => {
    const soma = await new DreCostCenterService(
      prismaWith([
        row('0.10', 'income', 'A', MISSOES),
        row('0.20', 'income', 'A', TEMPLO),
        row('0.10', 'expense', 'B', MISSOES),
        row('0.20', 'expense', 'B', TEMPLO),
      ]).prisma,
    ).build('t1', periodo);

    expect(soma.totals.revenue_total).toBe(0.3);
    expect(soma.totals.expenses_total).toBe(0.3);

    const resultado = await new DreCostCenterService(
      prismaWith([row('0.70', 'income', 'A', MISSOES), row('0.60', 'expense', 'B', MISSOES)]).prisma,
    ).build('t1', periodo);

    expect(resultado.columns[0]?.net_result).toBe(0.1);
    expect(resultado.totals.net_result).toBe(0.1);
  });

  it('sem lançamentos realizados: sem colunas, linhas vazias e totais zerados', async () => {
    const service = new DreCostCenterService(prismaWith([]).prisma);

    const dre = await service.build('t1', periodo);

    expect(dre.columns).toEqual([]);
    expect(dre.revenue).toEqual([]);
    expect(dre.expenses).toEqual([]);
    expect(dre.totals).toEqual({ revenue_total: 0, expenses_total: 0, net_result: 0 });
  });

  it('o recorte de congregação vale para a matriz inteira', async () => {
    const mixed = [
      row('100.00', 'income', 'Dízimos', MISSOES, { congregation_id: 'cong-1' }),
      row('900.00', 'income', 'Dízimos', MISSOES, { congregation_id: 'cong-2' }),
    ];
    const { prisma, wheres } = prismaWith(mixed);

    const dre = await new DreCostCenterService(prisma).build('t1', {
      ...periodo,
      congregation_id: 'cong-1',
    });

    expect(dre.totals.revenue_total).toBe(100);
    expect(wheres[0]?.['congregation_id']).toBe('cong-1');
  });

  it('consulta sempre dentro do tenant e cobre o último dia do período inteiro', async () => {
    const { prisma, wheres } = prismaWith([]);

    await new DreCostCenterService(prisma).build('tenant-abc', periodo);

    expect(wheres[0]?.['tenant_id']).toBe('tenant-abc');
    expect((wheres[0]?.['occurred_at'] as { lte: Date }).lte.toISOString()).toBe(
      '2026-01-31T23:59:59.999Z',
    );
  });
});
