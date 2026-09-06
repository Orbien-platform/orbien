/**
 * `getWeeklyDashboard` faz cinco idas ao banco, quatro delas com
 * `$queryRaw` — e `$queryRaw` não se testa com mock (ver docs/TESTES.md).
 * Esta suíte mocka `$queryRaw` só para exercitar a ARITMÉTICA que o método
 * faz em cima do retorno (preenchimento das 8 semanas, `vs_last_month_pct`,
 * mapeamento de categoria, média por contribuinte, contagem de dizimistas) —
 * não a correção do SQL. A correção do SQL é responsabilidade de
 * `test/integration/dashboard.integration.spec.ts`, que roda contra o
 * Postgres de verdade.
 */

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
  weekRows?: unknown[];
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
    weekRows = [],
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
  // semanas, top categorias, média por contribuinte, e (condicional) dízimo.
  const queryRawCalls: unknown[][] = [weekRows, topRaw, [contribRow]];
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
  it('preenche as 8 semanas com zero quando não há linha alguma', async () => {
    const { service } = serviceWith();

    const result = await service.getWeeklyDashboard(user);

    expect(result.weekly).toHaveLength(8);
    expect(result.weekly.every((w) => w.income === 0 && w.expense === 0 && w.net === 0)).toBe(true);
  });

  it('preenche a semana correspondente quando o banco devolve uma linha', async () => {
    // O week_start da linha precisa bater com um dos 8 slots calculados pelo
    // serviço (segunda-feira mais recente, voltando 8 semanas). Para não
    // acoplar ao "agora" do relógio, usamos o resultado do próprio serviço
    // com weekRows vazio para descobrir os slots, e então testamos que uma
    // linha alinhada com um slot é usada.
    const empty = await serviceWith().service.getWeeklyDashboard(user);
    const targetWeekStart = empty.weekly[3]!.week_start;

    const { service } = serviceWith({
      weekRows: [{ week_start: targetWeekStart, week_end: new Date(), income: '100.50', expense: '20', net: '80.50' }],
    });

    const result = await service.getWeeklyDashboard(user);
    expect(result.weekly[3]).toMatchObject({ income: 100.5, expense: 20, net: 80.5 });
  });

  it('vs_last_month_pct é null quando não há receita no mês anterior', async () => {
    const { service } = serviceWith({ lastIncSum: null });

    const result = await service.getWeeklyDashboard(user);
    expect(result.current_month.vs_last_month_pct).toBeNull();
  });

  it('vs_last_month_pct calcula a variação percentual quando há mês anterior', async () => {
    const { service } = serviceWith({ curIncSum: '150', lastIncSum: '100' });

    const result = await service.getWeeklyDashboard(user);
    expect(result.current_month.vs_last_month_pct).toBe(50);
    expect(result.current_month.income).toBe(150);
  });

  it('current_month.net é a diferença entre receita e despesa do mês', async () => {
    const { service } = serviceWith({ curIncSum: '300', curExpSum: '120' });

    const result = await service.getWeeklyDashboard(user);
    expect(result.current_month.net).toBe(180);
  });

  it('top_income_categories vazio quando não há categoria com receita no mês', async () => {
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
    // Só 3 chamadas de $queryRaw: semanas, top categorias, contribuinte —
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

  it('quando "hoje" é domingo, a última segunda-feira volta 6 dias (ramo dow===0)', async () => {
    // `lastMondayOf` trata domingo (getUTCDay() === 0) como um caso à parte:
    // 1 - 0 daria "amanhã", então o serviço usa -6 explicitamente. Sem travar
    // o relógio num domingo, este ramo nunca é exercitado.
    jest.useFakeTimers().setSystemTime(new Date('2026-02-01T12:00:00.000Z')); // domingo
    try {
      const { service } = serviceWith();
      const result = await service.getWeeklyDashboard(user);
      // A última semana (índice 7) deve começar na segunda-feira anterior ao
      // domingo travado, isto é, 26/01/2026 — 6 dias antes, não 1.
      expect(result.weekly[7]!.week_start.toISOString().slice(0, 10)).toBe('2026-01-26');
    } finally {
      jest.useRealTimers();
    }
  });

  it('quando "hoje" não é domingo, a última segunda-feira usa 1 - dow (ramo else)', async () => {
    // As demais suítes acima não travam o relógio, então cobrem este ramo só
    // por acidente — nos dias em que "agora" de verdade não cai num domingo.
    // Quando a suíte roda num domingo (como a de cima trava de propósito),
    // ninguém mais exercita o `else`, e a cobertura de branch cai. Trava
    // numa quarta-feira para não depender do dia real.
    jest.useFakeTimers().setSystemTime(new Date('2026-02-04T12:00:00.000Z')); // quarta-feira
    try {
      const { service } = serviceWith();
      const result = await service.getWeeklyDashboard(user);
      // Última semana (índice 7) começa na segunda-feira da mesma semana da
      // quarta-feira travada, isto é, 02/02/2026 — 2 dias antes, não 6.
      expect(result.weekly[7]!.week_start.toISOString().slice(0, 10)).toBe('2026-02-02');
    } finally {
      jest.useRealTimers();
    }
  });
});
