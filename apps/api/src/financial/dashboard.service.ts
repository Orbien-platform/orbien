import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { buildBuckets, dayKey, previousPeriod, resolvePeriod } from './dashboard-period';

type SeriesRow = {
  bucket_start: Date;
  income: Prisma.Decimal | null;
  expense: Prisma.Decimal | null;
};

type ContribRow = {
  total: Prisma.Decimal | null;
  donor_count: bigint;
};

type TitheRow = { count: bigint };

type TopCatRow = { category_id: string; total: Prisma.Decimal | null };

function toNum(v: Prisma.Decimal | null | undefined): number {
  return v ? Number(v) : 0;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Os números da Visão Geral do financeiro, para o período pedido (mês
   * corrente quando não vem nenhum). Fonte única dos cartões e do gráfico: a
   * lista de Lançamentos e esta resposta somam as mesmas linhas, com a mesma
   * fronteira de dia (ver `dashboard-period.ts`).
   */
  async getWeeklyDashboard(user: JwtPayload, periodStart?: string, periodEnd?: string) {
    const now = new Date();
    const tid = user.tenant_id;
    const cid = user.congregation_id;

    let period;
    try {
      period = resolvePeriod(periodStart, periodEnd, now);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const { start, endExclusive } = period;

    // ── 1. Série do gráfico: semanas ou meses dentro do período ───────────
    // `unit` vem de um conjunto fechado de duas strings, nunca de entrada.
    const unit = Prisma.raw(period.granularity);
    const seriesRows = await this.prisma.client.$queryRaw<SeriesRow[]>`
      SELECT
        date_trunc('${unit}', occurred_at) AS bucket_start,
        SUM(CASE WHEN type = ${TransactionType.income}::\"TransactionType\" THEN amount ELSE 0 END)  AS income,
        SUM(CASE WHEN type = ${TransactionType.expense}::\"TransactionType\" THEN amount ELSE 0 END) AS expense
      FROM financial_transactions
      WHERE tenant_id       = ${tid}
        AND congregation_id = ${cid}
        AND occurred_at    >= ${start}
        AND occurred_at     < ${endExclusive}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const rowByBucket = new Map(seriesRows.map((r) => [dayKey(r.bucket_start), r]));
    const series = buildBuckets(period).map((b) => {
      const row = rowByBucket.get(dayKey(b.start));
      const income = toNum(row?.income);
      const expense = toNum(row?.expense);
      return {
        // O primeiro e o último balde são recortados no período escolhido.
        start: dayKey(b.start < period.start ? period.start : b.start),
        end: dayKey(b.end > period.end ? period.end : b.end),
        income,
        expense,
        net: income - expense,
      };
    });

    // ── 2. Totais do período e variação contra o período anterior ─────────
    const previous = previousPeriod(period);
    const periodWhere = (gte: Date, lt: Date) => ({
      tenant_id: tid,
      congregation_id: cid,
      occurred_at: { gte, lt },
    });

    // Só três agregações: `vs_previous_pct` compara receita apenas.
    const [curInc, curExp, prevInc] = await Promise.all([
      this.prisma.client.financialTransaction.aggregate({
        where: { ...periodWhere(start, endExclusive), type: TransactionType.income },
        _sum: { amount: true },
      }),
      this.prisma.client.financialTransaction.aggregate({
        where: { ...periodWhere(start, endExclusive), type: TransactionType.expense },
        _sum: { amount: true },
      }),
      this.prisma.client.financialTransaction.aggregate({
        where: { ...periodWhere(previous.start, previous.endExclusive), type: TransactionType.income },
        _sum: { amount: true },
      }),
    ]);

    const curIncome = toNum(curInc._sum.amount);
    const curExpense = toNum(curExp._sum.amount);
    const prevIncome = toNum(prevInc._sum.amount);

    const vs_previous_pct =
      prevIncome === 0
        ? null
        : Math.round(((curIncome - prevIncome) / prevIncome) * 100 * 100) / 100;

    // ── 3. Top 5 categorias de receita (período) ──────────────────────────
    const topRaw = await this.prisma.client.$queryRaw<TopCatRow[]>`
      SELECT category_id, SUM(amount) AS total
      FROM financial_transactions
      WHERE tenant_id       = ${tid}
        AND congregation_id = ${cid}
        AND type            = ${TransactionType.income}::\"TransactionType\"
        AND occurred_at    >= ${start}
        AND occurred_at     < ${endExclusive}
      GROUP BY category_id
      ORDER BY total DESC
      LIMIT 5
    `;

    const catIds = topRaw.map((r) => r.category_id);
    const cats = catIds.length
      ? await this.prisma.client.financialCategory.findMany({
          where: { id: { in: catIds } },
          select: { id: true, name: true },
        })
      : [];
    const catMap = new Map(cats.map((c) => [c.id, c.name]));

    const top_income_categories = topRaw.map((r) => ({
      category_name: catMap.get(r.category_id) ?? r.category_id,
      total: toNum(r.total),
    }));

    // ── 4. Média por contribuinte (período) ───────────────────────────────
    const [contribRows] = await this.prisma.client.$queryRaw<ContribRow[]>`
      SELECT
        COALESCE(SUM(amount), 0)                                             AS total,
        COUNT(DISTINCT donor_person_id) FILTER (WHERE donor_person_id IS NOT NULL) AS donor_count
      FROM financial_transactions
      WHERE tenant_id       = ${tid}
        AND congregation_id = ${cid}
        AND type            = ${TransactionType.income}::\"TransactionType\"
        AND occurred_at    >= ${start}
        AND occurred_at     < ${endExclusive}
    `;
    const donorCount = Number(contribRows.donor_count);
    const average_per_contributor =
      donorCount > 0 ? toNum(contribRows.total) / donorCount : 0;

    // ── 5. Dizimistas ativos: últimos 30 dias a partir de hoje ────────────
    // Não acompanha o período escolhido de propósito — "ativo" é uma foto do
    // presente, não do intervalo que se está olhando.
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dizimo = await this.prisma.client.financialCategory.findFirst({
      where: { tenant_id: tid, congregation_id: cid, name: 'Dízimo' },
      select: { id: true },
    });

    let tithe_active_count = 0;
    if (dizimo) {
      const [titheRow] = await this.prisma.client.$queryRaw<TitheRow[]>`
        SELECT COUNT(DISTINCT donor_person_id) AS count
        FROM financial_transactions
        WHERE tenant_id       = ${tid}
          AND congregation_id = ${cid}
          AND category_id     = ${dizimo.id}
          AND occurred_at    >= ${thirtyDaysAgo}
          AND donor_person_id IS NOT NULL
      `;
      tithe_active_count = Number(titheRow.count);
    }

    return {
      period: {
        start: dayKey(period.start),
        end: dayKey(period.end),
        granularity: period.granularity,
      },
      series,
      totals: {
        income: curIncome,
        expense: curExpense,
        net: curIncome - curExpense,
        vs_previous_pct,
      },
      top_income_categories,
      average_per_contributor,
      tithe_active_count,
    };
  }
}
