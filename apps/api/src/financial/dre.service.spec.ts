/**
 * O DRE é o número que sai em PDF e vai para a prestação de contas da igreja.
 * Errar aqui não estoura em runtime: sai um relatório plausível e errado.
 *
 * Duas coisas concentram o risco, e são o foco desta suíte:
 *
 *   1. `previousPeriod` é híbrido de propósito: quando o período pedido são
 *      meses inteiros, o anterior são os meses de calendário equivalentes
 *      (fevereiro compara com janeiro inteiro); para recorte arbitrário, volta
 *      a ser por comprimento, porque "mês anterior" não significa nada ali.
 *   2. `groupByCategory` arredonda só no fim, depois de somar. Somar centavos
 *      arredondados por transação daria outro total.
 *
 * A suíte também prende o `void isPastor`: hoje o papel não muda nada na
 * resposta, e o comentário no serviço afirma que a agregação já é anônima.
 * Se alguém passar a redigir por papel, este teste é o que avisa.
 */

import { Decimal } from '@prisma/client/runtime/library';
import { DreService, DreQuery } from './dre.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = {
  amount: Decimal;
  category: { name: string; type: string };
};

function tx(amount: string, name: string, type: string): Tx {
  return { amount: new Decimal(amount), category: { name, type } };
}

/**
 * `findMany` é chamado duas vezes: período atual e período anterior. O fake
 * devolve a primeira lista na primeira chamada e a segunda na segunda, e
 * guarda os `where` para que os testes possam afirmar o que foi consultado.
 */
function serviceWith(current: Tx[], previous: Tx[] = []) {
  const wheres: Record<string, unknown>[] = [];
  let call = 0;

  const prisma = {
    client: {
      financialTransaction: {
        findMany: (args: { where: Record<string, unknown> }) => {
          wheres.push(args.where);
          return Promise.resolve(call++ === 0 ? current : previous);
        },
      },
    },
  } as unknown as PrismaService;

  return { service: new DreService(prisma), wheres };
}

const janeiro: DreQuery = { period_start: '2026-01-01', period_end: '2026-01-31' };

describe('DreService.buildDre', () => {
  describe('agrupamento por categoria', () => {
    it('separa receita de despesa e soma cada categoria', async () => {
      const { service } = serviceWith([
        tx('100.00', 'Dízimos', 'income'),
        tx('50.50', 'Dízimos', 'income'),
        tx('30.00', 'Ofertas', 'income'),
        tx('80.00', 'Aluguel', 'expense'),
      ]);

      const dre = await service.buildDre('t1', 'c1', janeiro, false);

      expect(dre.revenue.categories).toEqual([
        { category_name: 'Dízimos', total: 150.5, count: 2 },
        { category_name: 'Ofertas', total: 30, count: 1 },
      ]);
      expect(dre.expenses.categories).toEqual([
        { category_name: 'Aluguel', total: 80, count: 1 },
      ]);
      expect(dre.revenue.total).toBe(180.5);
      expect(dre.expenses.total).toBe(80);
      expect(dre.net_result).toBe(100.5);
    });

    it('ordena as categorias da maior para a menor', async () => {
      const { service } = serviceWith([
        tx('10.00', 'Pequena', 'income'),
        tx('900.00', 'Grande', 'income'),
        tx('100.00', 'Media', 'income'),
      ]);

      const dre = await service.buildDre('t1', 'c1', janeiro, false);

      expect(dre.revenue.categories.map((c) => c.category_name)).toEqual([
        'Grande',
        'Media',
        'Pequena',
      ]);
    });

    it('tudo que não é `income` conta como despesa', async () => {
      // O serviço decide por `type === 'income'`, então qualquer outro valor
      // cai em despesa. Prende a escolha: um `type` novo no schema vira
      // despesa silenciosamente, e é aqui que isso aparece.
      const { service } = serviceWith([tx('40.00', 'Categoria Nova', 'transfer')]);

      const dre = await service.buildDre('t1', 'c1', janeiro, false);

      expect(dre.revenue.categories).toEqual([]);
      expect(dre.expenses.categories).toEqual([
        { category_name: 'Categoria Nova', total: 40, count: 1 },
      ]);
    });

    it('período sem transação nenhuma devolve zeros, não erro', async () => {
      const { service } = serviceWith([]);

      const dre = await service.buildDre('t1', 'c1', janeiro, false);

      expect(dre.revenue).toEqual({ categories: [], total: 0 });
      expect(dre.expenses).toEqual({ categories: [], total: 0 });
      expect(dre.net_result).toBe(0);
    });

    it('arredonda a soma, e não cada transação', async () => {
      // Três centavos de terço: 0.005 cada. Arredondar por transação daria
      // 0.03 (0.01 × 3); somar antes dá 0.015 → 0.02. O serviço faz o segundo.
      const { service } = serviceWith([
        tx('0.005', 'Miúdos', 'income'),
        tx('0.005', 'Miúdos', 'income'),
        tx('0.005', 'Miúdos', 'income'),
      ]);

      const dre = await service.buildDre('t1', 'c1', janeiro, false);

      expect(dre.revenue.categories[0]?.total).toBe(0.02);
    });
  });

  describe('período anterior', () => {
    it('janeiro cheio → dezembro cheio, atravessando a virada de ano', async () => {
      const { service } = serviceWith([], [tx('70.00', 'Dízimos', 'income')]);

      const dre = await service.buildDre('t1', 'c1', janeiro, false);

      expect(dre.period).toEqual({ start: '2026-01-01', end: '2026-01-31' });
      expect(dre.previous_period.period).toEqual({
        start: '2025-12-01',
        end: '2025-12-31',
      });
      expect(dre.previous_period.revenue_total).toBe(70);
    });

    it('fevereiro de 28 dias compara com janeiro INTEIRO', async () => {
      // O caso que motivou a correção. Pela conta antiga, de comprimento, o
      // período anterior era 04/01–31/01: os três primeiros dias de janeiro
      // ficavam fora, e a comparação aparecia menor sem que nada tivesse
      // caído.
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2026-02-01', period_end: '2026-02-28' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2026-01-01',
        end: '2026-01-31',
      });
    });

    it('março compara com fevereiro, que é mais curto — sem esticar o período', async () => {
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2026-03-01', period_end: '2026-03-31' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2026-02-01',
        end: '2026-02-28',
      });
    });

    it('fevereiro de ano bissexto compara com janeiro inteiro', async () => {
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2028-02-01', period_end: '2028-02-29' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2028-01-01',
        end: '2028-01-31',
      });
    });

    it('trimestre compara com o trimestre anterior', async () => {
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2026-01-01', period_end: '2026-03-31' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2025-10-01',
        end: '2025-12-31',
      });
    });

    it('ano inteiro compara com o ano anterior', async () => {
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2026-01-01', period_end: '2026-12-31' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2025-01-01',
        end: '2025-12-31',
      });
    });

    it('recorte arbitrário continua por comprimento', async () => {
      // 15/01 a 14/02 não são meses inteiros: não existe "mês anterior" que
      // faça sentido, e a conta por comprimento é a resposta certa. Prende que
      // a correção não vazou para este caminho.
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2026-01-15', period_end: '2026-02-14' },
        false,
      );

      // 31 dias, os mesmos do período pedido: 15/12 a 14/01.
      expect(dre.previous_period.period).toEqual({
        start: '2025-12-15',
        end: '2026-01-14',
      });
    });

    it('período que começa no dia 1 mas não fecha o mês é por comprimento', async () => {
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2026-02-01', period_end: '2026-02-20' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2026-01-12',
        end: '2026-01-31',
      });
    });

    it('período de um dia devolve o dia anterior', async () => {
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2026-03-10', period_end: '2026-03-10' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2026-03-09',
        end: '2026-03-09',
      });
    });

    it('três meses que começam no fim de um ano (nov → jan) comparam com ago → out', async () => {
      // O mês final (1) é menor que o inicial (11): a conta de meses tem que
      // atravessar a virada de ano, senão o "anterior" sai com meses de menos ou de mais.
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2025-11-01', period_end: '2026-01-31' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2025-08-01',
        end: '2025-10-31',
      });
    });

    it('a consulta do período anterior vai de 00:00:00.000 do primeiro dia a 23:59:59.999 do último', async () => {
      const { service, wheres } = serviceWith([]);

      await service.buildDre('t1', 'c1', janeiro, false);

      const anterior = wheres[1] as { occurred_at: { gte: Date; lte: Date } };
      expect(anterior.occurred_at.gte.toISOString()).toBe('2025-12-01T00:00:00.000Z');
      expect(anterior.occurred_at.lte.toISOString()).toBe('2025-12-31T23:59:59.999Z');
    });

    it('soma receita e despesa do período anterior e devolve o resultado', async () => {
      const { service } = serviceWith(
        [],
        [
          tx('200.00', 'Dízimos', 'income'),
          tx('50.00', 'Ofertas', 'income'),
          tx('30.00', 'Aluguel', 'expense'),
        ],
      );

      const dre = await service.buildDre('t1', 'c1', janeiro, false);

      expect(dre.previous_period.revenue_total).toBe(250);
      expect(dre.previous_period.expenses_total).toBe(30);
      expect(dre.previous_period.net_result).toBe(220);
    });
  });

  describe('filtros que vão para o banco', () => {
    it('o período atual cobre o dia inteiro do `period_end`', async () => {
      const { service, wheres } = serviceWith([]);

      await service.buildDre('t1', 'c1', janeiro, false);

      const occurred = wheres[0]?.['occurred_at'] as { gte: Date; lte: Date };
      expect(occurred.gte.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      // Sem o `setUTCHours(23,59,59,999)` o último dia do período ficaria de
      // fora — é o off-by-one clássico de relatório mensal.
      expect(occurred.lte.toISOString()).toBe('2026-01-31T23:59:59.999Z');
    });

    it('sem `congregation_id` na query, NENHUM dos dois períodos filtra congregação', async () => {
      // O caso que motivou a correção. O período atual sempre foi do tenant
      // inteiro; o anterior caía para a congregação do token, e os dois lados
      // do relatório mediam recortes diferentes. Agora o escopo é o mesmo.
      const { service, wheres } = serviceWith([]);

      await service.buildDre('t1', 'cong-do-token', janeiro, false);

      expect(wheres[0]).not.toHaveProperty('congregation_id');
      expect(wheres[1]).not.toHaveProperty('congregation_id');
    });

    it('a congregação do token não influencia o relatório', async () => {
      // Prende que o segundo argumento ficou fora da conta: dois tokens de
      // congregações diferentes, no mesmo tenant, veem o mesmo DRE.
      const a = serviceWith([]);
      const b = serviceWith([]);

      await a.service.buildDre('t1', 'cong-sede', janeiro, false);
      await b.service.buildDre('t1', 'cong-filial', janeiro, false);

      expect(a.wheres).toEqual(b.wheres);
    });

    it('com `congregation_id` na query, os dois períodos usam ela', async () => {
      const { service, wheres } = serviceWith([]);

      await service.buildDre(
        't1',
        'cong-do-token',
        { ...janeiro, congregation_id: 'cong-escolhida' },
        false,
      );

      expect(wheres[0]?.['congregation_id']).toBe('cong-escolhida');
      expect(wheres[1]?.['congregation_id']).toBe('cong-escolhida');
    });

    it('`cost_center` vira filtro por nome nos dois períodos', async () => {
      const { service, wheres } = serviceWith([]);

      await service.buildDre('t1', 'c1', { ...janeiro, cost_center: 'Missões' }, false);

      expect(wheres[0]?.['costCenter']).toEqual({ name: 'Missões' });
      expect(wheres[1]?.['costCenter']).toEqual({ name: 'Missões' });
    });

    it('sem `cost_center`, a chave não vai para o where', async () => {
      const { service, wheres } = serviceWith([]);

      await service.buildDre('t1', 'c1', janeiro, false);

      expect(wheres[0]).not.toHaveProperty('costCenter');
      expect(wheres[1]).not.toHaveProperty('costCenter');
    });

    it('o `tenant_id` vai nos dois períodos', async () => {
      const { service, wheres } = serviceWith([]);

      await service.buildDre('tenant-abc', 'c1', janeiro, false);

      expect(wheres[0]?.['tenant_id']).toBe('tenant-abc');
      expect(wheres[1]?.['tenant_id']).toBe('tenant-abc');
    });
  });

  describe('isPastor', () => {
    it('não muda nada na resposta — a agregação já é anônima', async () => {
      // O serviço tem um `void isPastor` com o comentário de que não há
      // redação extra a fazer. Este teste é essa decisão escrita: se um dia a
      // resposta passar a depender do papel, ele falha e força a revisão.
      const linhas = [
        tx('100.00', 'Dízimos', 'income'),
        tx('80.00', 'Aluguel', 'expense'),
      ];

      const comoPastor = await serviceWith(linhas, []).service.buildDre(
        't1',
        'c1',
        janeiro,
        true,
      );
      const comoTesoureiro = await serviceWith(linhas, []).service.buildDre(
        't1',
        'c1',
        janeiro,
        false,
      );

      expect(comoPastor).toEqual(comoTesoureiro);
    });
  });
});

// ---------------------------------------------------------------------------
// Lucro/prejuízo realizado, "A realizar" e filtro por centro (T2 · DRE-01, 02,
// 04, 09, 10, 11). O fake abaixo se comporta como o banco: aplica o `where`
// (status, período, centro) sobre uma tabela de lançamentos. Assim os testes
// afirmam o RESULTADO — o que entra e o que fica de fora — e não só a forma
// do `where`.
// ---------------------------------------------------------------------------

type Row = {
  amount: Decimal;
  status: 'pending' | 'paid' | 'confirmed';
  occurred_at: Date;
  cost_center_id: string | null;
  category: { name: string; type: string };
};

function row(
  amount: string,
  type: 'income' | 'expense',
  status: Row['status'],
  date: string,
  cost_center_id: string | null = null,
  name = type === 'income' ? 'Dízimos' : 'Aluguel',
): Row {
  return {
    amount: new Decimal(amount),
    status,
    occurred_at: new Date(`${date}T12:00:00.000Z`),
    cost_center_id,
    category: { name, type },
  };
}

function dbWith(rows: Row[]) {
  const wheres: Record<string, unknown>[] = [];
  const prisma = {
    client: {
      financialTransaction: {
        findMany: (args: { where: Record<string, unknown> }) => {
          const w = args.where as {
            occurred_at: { gte: Date; lte: Date };
            status?: { in: string[] };
            cost_center_id?: string | null;
          };
          wheres.push(args.where);
          return Promise.resolve(
            rows.filter(
              (r) =>
                r.occurred_at >= w.occurred_at.gte &&
                r.occurred_at <= w.occurred_at.lte &&
                (w.status === undefined || w.status.in.includes(r.status)) &&
                (!('cost_center_id' in w) || r.cost_center_id === w.cost_center_id),
            ),
          );
        },
      },
    },
  } as unknown as PrismaService;
  return { service: new DreService(prisma), wheres };
}

const CC_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const CC_B = '9b2f8c1e-1d3a-4c55-8a7e-0f6a2b9d4c11';

describe('DreService.buildDre — só realizado + A realizar', () => {
  it('pending não entra em receitas, despesas nem resultado do período atual', async () => {
    const { service } = dbWith([
      row('100.00', 'income', 'paid', '2026-01-10'),
      row('50.00', 'income', 'confirmed', '2026-01-11'),
      row('40.00', 'expense', 'paid', '2026-01-12'),
      row('999.00', 'income', 'pending', '2026-01-13'),
      row('888.00', 'expense', 'pending', '2026-01-14'),
    ]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.revenue.total).toBe(150);
    expect(dre.expenses.total).toBe(40);
    expect(dre.net_result).toBe(110);
    expect(dre.revenue.categories).toEqual([{ category_name: 'Dízimos', total: 150, count: 2 }]);
    expect(dre.expenses.categories).toEqual([{ category_name: 'Aluguel', total: 40, count: 1 }]);
  });

  it('pending não entra no período anterior', async () => {
    const { service } = dbWith([
      row('70.00', 'income', 'paid', '2025-12-10'),
      row('20.00', 'expense', 'confirmed', '2025-12-11'),
      row('500.00', 'income', 'pending', '2025-12-12'),
      row('300.00', 'expense', 'pending', '2025-12-13'),
    ]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.previous_period.revenue_total).toBe(70);
    expect(dre.previous_period.expenses_total).toBe(20);
    expect(dre.previous_period.net_result).toBe(50);
  });

  it('`pending` traz a soma dos pendentes do período, fora do net_result', async () => {
    const { service } = dbWith([
      row('100.00', 'income', 'paid', '2026-01-10'),
      row('200.00', 'income', 'pending', '2026-01-13'),
      row('30.50', 'income', 'pending', '2026-01-14'),
      row('80.25', 'expense', 'pending', '2026-01-15'),
      // pendente de outro período não conta
      row('7000.00', 'income', 'pending', '2026-02-02'),
    ]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.pending).toEqual({ revenue_total: 230.5, expenses_total: 80.25 });
    expect(dre.net_result).toBe(100);
  });

  it('sem pendentes, `pending` vem zerado', async () => {
    const { service } = dbWith([row('100.00', 'income', 'paid', '2026-01-10')]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.pending).toEqual({ revenue_total: 0, expenses_total: 0 });
  });

  it('período sem lançamentos: zeros e `pending` zerado', async () => {
    const { service } = dbWith([]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.net_result).toBe(0);
    expect(dre.pending).toEqual({ revenue_total: 0, expenses_total: 0 });
  });

  it('0,10 + 0,20 − 0,30 → net_result 0, sem resíduo de ponto flutuante', async () => {
    const { service } = dbWith([
      row('0.10', 'income', 'paid', '2026-01-05', null, 'A'),
      row('0.20', 'income', 'paid', '2026-01-06', null, 'B'),
      row('0.30', 'expense', 'paid', '2026-01-07'),
      row('0.10', 'income', 'paid', '2025-12-05', null, 'A'),
      row('0.20', 'income', 'paid', '2025-12-06', null, 'B'),
      row('0.30', 'expense', 'paid', '2025-12-07'),
    ]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.net_result).toBe(0);
    expect(dre.previous_period.net_result).toBe(0);
  });

  // 0,10 + 0,20 e 0,70 − 0,60 só dão 0,3 e 0,1 depois de arredondar: em ponto
  // flutuante saem 0.30000000000000004 e 0.09999999999999998. O caso de cima
  // (0,10 + 0,20 − 0,30) não separa: lá o resultado cai em zero de qualquer jeito.
  it('receita e despesa totais fecham em centavos: duas categorias 0,10 + 0,20 → 0,3', async () => {
    const { service } = dbWith([
      row('0.10', 'income', 'paid', '2026-01-05', null, 'A'),
      row('0.20', 'income', 'paid', '2026-01-06', null, 'B'),
      row('0.10', 'expense', 'paid', '2026-01-07', null, 'C'),
      row('0.20', 'expense', 'paid', '2026-01-08', null, 'D'),
    ]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.revenue.total).toBe(0.3);
    expect(dre.expenses.total).toBe(0.3);
  });

  it('net_result 0,70 − 0,60 → 0,1, no período atual e no anterior', async () => {
    const { service } = dbWith([
      row('0.70', 'income', 'paid', '2026-01-05'),
      row('0.60', 'expense', 'paid', '2026-01-06'),
      row('0.70', 'income', 'paid', '2025-12-05'),
      row('0.60', 'expense', 'paid', '2025-12-06'),
    ]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.net_result).toBe(0.1);
    expect(dre.previous_period.net_result).toBe(0.1);
  });

  it('o período anterior também soma em centavos: 0,10 + 0,20 → 0,3 de receita e de despesa', async () => {
    const { service } = dbWith([
      row('0.10', 'income', 'paid', '2025-12-05'),
      row('0.20', 'income', 'paid', '2025-12-06'),
      row('0.10', 'expense', 'paid', '2025-12-07'),
      row('0.20', 'expense', 'paid', '2025-12-08'),
    ]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.previous_period.revenue_total).toBe(0.3);
    expect(dre.previous_period.expenses_total).toBe(0.3);
  });

  it('o A realizar também soma em centavos: 0,10 + 0,20 → 0,3', async () => {
    const { service } = dbWith([
      row('0.10', 'income', 'pending', '2026-01-05'),
      row('0.20', 'income', 'pending', '2026-01-06'),
      row('0.10', 'expense', 'pending', '2026-01-07'),
      row('0.20', 'expense', 'pending', '2026-01-08'),
    ]);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.pending).toEqual({ revenue_total: 0.3, expenses_total: 0.3 });
  });
});

describe('DreService.buildDre — filtro por centro de custo', () => {
  const rows = [
    row('100.00', 'income', 'paid', '2026-01-10', CC_A),
    row('30.00', 'expense', 'paid', '2026-01-11', CC_A),
    row('500.00', 'income', 'paid', '2026-01-12', CC_B),
    row('60.00', 'income', 'confirmed', '2026-01-13', null),
    row('90.00', 'income', 'paid', '2025-12-10', CC_A),
    row('400.00', 'income', 'paid', '2025-12-11', CC_B),
    row('25.00', 'income', 'pending', '2026-01-14', CC_A),
  ];

  it('cost_center_id=UUID recorta o período atual, o anterior e o A realizar', async () => {
    const { service } = dbWith(rows);

    const dre = await service.buildDre('t1', 'c1', { ...janeiro, cost_center_id: CC_A }, false);

    expect(dre.revenue.total).toBe(100);
    expect(dre.expenses.total).toBe(30);
    expect(dre.net_result).toBe(70);
    expect(dre.previous_period.revenue_total).toBe(90);
    expect(dre.pending).toEqual({ revenue_total: 25, expenses_total: 0 });
  });

  it('cost_center_id=none traz só lançamentos sem centro, nos dois períodos', async () => {
    const { service } = dbWith([...rows, row('15.00', 'income', 'paid', '2025-12-20', null)]);

    const dre = await service.buildDre('t1', 'c1', { ...janeiro, cost_center_id: 'none' }, false);

    expect(dre.revenue.total).toBe(60);
    expect(dre.net_result).toBe(60);
    expect(dre.previous_period.revenue_total).toBe(15);
    expect(dre.pending).toEqual({ revenue_total: 0, expenses_total: 0 });
  });

  it('sem cost_center_id, nenhum filtro de centro é aplicado', async () => {
    const { service, wheres } = dbWith(rows);

    const dre = await service.buildDre('t1', 'c1', janeiro, false);

    expect(dre.revenue.total).toBe(660);
    for (const w of wheres) {
      expect(w).not.toHaveProperty('cost_center_id');
      expect(w).not.toHaveProperty('costCenter');
    }
  });

  it('cost_center_id vence cost_center (nome)', async () => {
    const { service, wheres } = dbWith(rows);

    const dre = await service.buildDre(
      't1',
      'c1',
      { ...janeiro, cost_center_id: CC_B, cost_center: 'Missões' },
      false,
    );

    expect(dre.revenue.total).toBe(500);
    for (const w of wheres) {
      expect(w['cost_center_id']).toBe(CC_B);
      expect(w).not.toHaveProperty('costCenter');
    }
  });

  it('centro de outro tenant (sem lançamentos do tenant) devolve DRE zerado', async () => {
    const { service, wheres } = dbWith([]);

    const dre = await service.buildDre(
      'tenant-a',
      'c1',
      { ...janeiro, cost_center_id: '11111111-2222-4333-8444-555555555555' },
      false,
    );

    expect(dre.revenue.total).toBe(0);
    expect(dre.expenses.total).toBe(0);
    expect(dre.net_result).toBe(0);
    expect(dre.previous_period.net_result).toBe(0);
    expect(dre.pending).toEqual({ revenue_total: 0, expenses_total: 0 });
    // o isolamento é por tenant_id em toda consulta (incluindo a de "A realizar")
    expect(wheres).toHaveLength(3);
    for (const w of wheres) expect(w['tenant_id']).toBe('tenant-a');
  });

  it('o cost_center por nome continua funcionando (compatibilidade)', async () => {
    const { service, wheres } = dbWith([]);

    await service.buildDre('t1', 'c1', { ...janeiro, cost_center: 'Missões' }, false);

    for (const w of wheres) expect(w['costCenter']).toEqual({ name: 'Missões' });
  });
});
