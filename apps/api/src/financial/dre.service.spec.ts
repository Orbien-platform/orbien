/**
 * O DRE é o número que sai em PDF e vai para a prestação de contas da igreja.
 * Errar aqui não estoura em runtime: sai um relatório plausível e errado.
 *
 * Duas coisas concentram o risco, e são o foco desta suíte:
 *
 *   1. `previousPeriod` é aritmética de milissegundos, não de calendário. O
 *      período anterior tem o MESMO comprimento do atual — não é "o mês
 *      passado". Para janeiro cheio isso coincide com dezembro; para fevereiro
 *      não coincide com janeiro, e é fácil ler o relatório supondo que sim.
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

    it('fevereiro de 28 dias NÃO devolve janeiro inteiro', async () => {
      // Comportamento por comprimento, não por calendário: 28 dias antes de
      // 01/02 começa em 04/01, então os três primeiros dias de janeiro ficam
      // fora da comparação. Não é bug — é o que o serviço faz de propósito —
      // mas é contraintuitivo o suficiente para merecer um teste com nome.
      const { service } = serviceWith([]);

      const dre = await service.buildDre(
        't1',
        'c1',
        { period_start: '2026-02-01', period_end: '2026-02-28' },
        false,
      );

      expect(dre.previous_period.period).toEqual({
        start: '2026-01-04',
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

    it('sem `congregation_id` na query, o período atual não filtra congregação', async () => {
      const { service, wheres } = serviceWith([]);

      await service.buildDre('t1', 'cong-do-token', janeiro, false);

      expect(wheres[0]).not.toHaveProperty('congregation_id');
      // Mas o período anterior filtra, caindo na congregação do token. Os dois
      // lados do relatório passam a medir escopos diferentes. Prende o
      // comportamento atual; ver a nota em docs/PENDENCIAS.md.
      expect(wheres[1]?.['congregation_id']).toBe('cong-do-token');
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
