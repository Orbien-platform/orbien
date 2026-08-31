import { Injectable } from '@nestjs/common';
import { Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

type WeeklyRow = {
  week_start: Date;
  week_end: Date;
  income: Prisma.Decimal | null;
  expense: Prisma.Decimal | null;
  net: Prisma.Decimal | null;
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

function monthStart(y: number, m: number): Date {
  return new Date(Date.UTC(y, m, 1));
}

function lastMondayOf(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  const dow = copy.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getWeeklyDashboard(user: JwtPayload) {
    const now = new Date();
    const tid = user.tenant_id;
    const cid = user.congregation_id;

    // ── 1. Last 8 weeks ────────────────────────────────────────────────────
    const currentMonday = lastMondayOf(now);
    const eightWeeksAgo = new Date(currentMonday);
    eightWeeksAgo.setUTCDate(currentMonday.getUTCDate() - 7 * 7); // 8 weeks back (current week is week 8)

    const weekRows = await this.prisma.client.$queryRaw<WeeklyRow[]>`
      SELECT
        date_trunc('week', occurred_at)                            AS week_start,
        date_trunc('week', occurred_at) + INTERVAL '6 days'       AS week_end,
        SUM(CASE WHEN type = ${TransactionType.income}::\"TransactionType\" THEN amount ELSE 0 END)  AS income,
        SUM(CASE WHEN type = ${TransactionType.expense}::\"TransactionType\" THEN amount ELSE 0 END) AS expense,
        SUM(CASE WHEN type = ${TransactionType.income}::\"TransactionType\" THEN amount ELSE -amount END) AS net
      FROM financial_transactions
      WHERE tenant_id       = ${tid}
        AND congregation_id = ${cid}
        AND occurred_at    >= ${eightWeeksAgo}
      GROUP BY date_trunc('week', occurred_at)
      ORDER BY week_start ASC
    `;

    // Fill all 8 slots with zeros for missing weeks
    const weekMap = new Map(weekRows.map((r) => [r.week_start.toISOString(), r]));
    const weekly = Array.from({ length: 8 }, (_, i) => {
      const ws = new Date(eightWeeksAgo);
      ws.setUTCDate(eightWeeksAgo.getUTCDate() + i * 7);
      const we = new Date(ws);
      we.setUTCDate(ws.getUTCDate() + 6);
      const row = weekMap.get(ws.toISOString());
      return {
        week_start: ws,
        week_end: we,
        income: toNum(row?.income),
        expense: toNum(row?.expense),
        net: toNum(row?.net),
      };
    });

    // ── 2. Current month vs last month ─────────────────────────────────────
    const curMonthStart = monthStart(now.getUTCFullYear(), now.getUTCMonth());
    const lastMonthStart = monthStart(now.getUTCFullYear(), now.getUTCMonth() - 1);

    const baseWhere = (gte: Date, lt: Date) => ({
      tenant_id: tid,
      congregation_id: cid,
      occurred_at: { gte, lt },
    });

    const [curInc, curExp, lastInc, lastExp] = await Promise.all([
      this.prisma.client.financialTransaction.aggregate({
        where: { ...baseWhere(curMonthStart, now), type: TransactionType.income },
        _sum: { amount: true },
      }),
      this.prisma.client.financialTransaction.aggregate({
        where: { ...baseWhere(curMonthStart, now), type: TransactionType.expense },
        _sum: { amount: true },
      }),
      this.prisma.client.financialTransaction.aggregate({
        where: { ...baseWhere(lastMonthStart, curMonthStart), type: TransactionType.income },
        _sum: { amount: true },
      }),
      this.prisma.client.financialTransaction.aggregate({
        where: { ...baseWhere(lastMonthStart, curMonthStart), type: TransactionType.expense },
        _sum: { amount: true },
      }),
    ]);

    const curIncome = toNum(curInc._sum.amount);
    const curExpense = toNum(curExp._sum.amount);
    const lastIncome = toNum(lastInc._sum.amount);

    const vs_last_month_pct =
      lastIncome === 0
        ? null
        : Math.round(((curIncome - lastIncome) / lastIncome) * 100 * 100) / 100;

    // ── 3. Top 5 income categories (current month) ─────────────────────────
    const topRaw = await this.prisma.client.$queryRaw<TopCatRow[]>`
      SELECT category_id, SUM(amount) AS total
      FROM financial_transactions
      WHERE tenant_id       = ${tid}
        AND congregation_id = ${cid}
        AND type            = ${TransactionType.income}::\"TransactionType\"
        AND occurred_at    >= ${curMonthStart}
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

    // ── 4. Average per contributor ─────────────────────────────────────────
    const [contribRows] = await this.prisma.client.$queryRaw<ContribRow[]>`
      SELECT
        COALESCE(SUM(amount), 0)                                             AS total,
        COUNT(DISTINCT donor_person_id) FILTER (WHERE donor_person_id IS NOT NULL) AS donor_count
      FROM financial_transactions
      WHERE tenant_id       = ${tid}
        AND congregation_id = ${cid}
        AND type            = ${TransactionType.income}::\"TransactionType\"
        AND occurred_at    >= ${curMonthStart}
    `;
    const donorCount = Number(contribRows.donor_count);
    const average_per_contributor =
      donorCount > 0 ? toNum(contribRows.total) / donorCount : 0;

    // ── 5. Tithe active count (last 30 days) ───────────────────────────────
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
      weekly,
      current_month: {
        income: curIncome,
        expense: curExpense,
        net: curIncome - curExpense,
        vs_last_month_pct,
      },
      top_income_categories,
      average_per_contributor,
      tithe_active_count,
    };
  }
}
