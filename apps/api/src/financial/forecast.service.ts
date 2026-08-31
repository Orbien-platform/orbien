import { Injectable } from '@nestjs/common';
import { Prisma, TransactionSource, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

type HistoricalRow = { month: string; total: Prisma.Decimal | null };

function toNum(v: Prisma.Decimal | null | undefined): number {
  return v ? Number(v) : 0;
}

function toYYYYMM(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class ForecastService {
  constructor(private readonly prisma: PrismaService) {}

  async getForecast(months: 3 | 6 | 12, user: JwtPayload) {
    const now = new Date();
    const tid = user.tenant_id;
    const cid = user.congregation_id;

    // ── 1. Historical: last 3 months income grouped by month ──────────────
    const threeMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
    const curMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const histRows = await this.prisma.client.$queryRaw<HistoricalRow[]>`
      SELECT
        to_char(date_trunc('month', occurred_at), 'YYYY-MM') AS month,
        SUM(amount)                                           AS total
      FROM financial_transactions
      WHERE tenant_id       = ${tid}
        AND congregation_id = ${cid}
        AND type            = ${TransactionType.income}::\"TransactionType\"
        AND occurred_at    >= ${threeMonthsAgo}
        AND occurred_at     < ${curMonthStart}
      GROUP BY date_trunc('month', occurred_at)
      ORDER BY month ASC
    `;

    const historical = histRows.map((r) => ({ month: r.month, total: toNum(r.total) }));

    // ── 2. Recurring monthly (source = recurring, last 30 days) ───────────
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recurringAgg = await this.prisma.client.financialTransaction.aggregate({
      where: {
        tenant_id: tid,
        congregation_id: cid,
        source: TransactionSource.recurring,
        occurred_at: { gte: thirtyDaysAgo },
      },
      _sum: { amount: true },
    });
    const recurring_monthly = toNum(recurringAgg._sum.amount);

    // ── 3. Projections ────────────────────────────────────────────────────
    const months_of_history = historical.length;
    const totalHist = historical.reduce((s, r) => s + r.total, 0);
    const monthly_average = months_of_history > 0 ? totalHist / months_of_history : 0;

    const projected = Array.from({ length: months }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 + i, 1));
      return {
        month: toYYYYMM(d),
        projected: monthly_average + recurring_monthly,
      };
    });

    return {
      historical,
      projected,
      monthly_average,
      recurring_monthly,
      months_of_history,
    };
  }
}
