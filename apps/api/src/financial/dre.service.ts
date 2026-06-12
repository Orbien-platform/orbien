import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface DreCategoryLine {
  category_name: string;
  total: number;
  count: number;
}

export interface DrePeriodSummary {
  period: { start: string; end: string };
  revenue_total: number;
  expenses_total: number;
  net_result: number;
}

export interface DreResult {
  period: { start: string; end: string };
  revenue: { categories: DreCategoryLine[]; total: number };
  expenses: { categories: DreCategoryLine[]; total: number };
  net_result: number;
  previous_period: DrePeriodSummary;
}

export interface DreQuery {
  period_start: string;
  period_end: string;
  congregation_id?: string;
  cost_center?: string;
}

@Injectable()
export class DreService {
  constructor(private readonly prisma: PrismaService) {}

  async buildDre(
    tenantId: string,
    congregationId: string,
    query: DreQuery,
    isPastor: boolean,
  ): Promise<DreResult> {
    const start = new Date(query.period_start);
    const end = new Date(query.period_end);
    end.setUTCHours(23, 59, 59, 999);

    const where: object = {
      tenant_id: tenantId,
      occurred_at: { gte: start, lte: end },
      ...(query.congregation_id
        ? { congregation_id: query.congregation_id }
        : {}),
      ...(query.cost_center
        ? { costCenter: { name: query.cost_center } }
        : {}),
    };

    const transactions = await this.prisma.client.financialTransaction.findMany(
      {
        where,
        include: {
          category: { select: { name: true, type: true } },
        },
      },
    );

    const { revenueLines, expenseLines } = this.groupByCategory(transactions);

    const revenueTotal = revenueLines.reduce((s, l) => s + l.total, 0);
    const expensesTotal = expenseLines.reduce((s, l) => s + l.total, 0);

    // Previous period: same length shifted back
    const prev = this.previousPeriod(start, end);
    const prevSummary = await this.fetchPeriodSummary(
      tenantId,
      query.congregation_id ?? congregationId,
      query.cost_center,
      prev.start,
      prev.end,
    );

    // Pastors see only totals per category (no individual amounts beyond grouping)
    // The grouping itself is already anonymous; no extra redaction needed here.
    void isPastor;

    return {
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      revenue: { categories: revenueLines, total: revenueTotal },
      expenses: { categories: expenseLines, total: expensesTotal },
      net_result: revenueTotal - expensesTotal,
      previous_period: prevSummary,
    };
  }

  // ---------------------------------------------------------------------------

  private groupByCategory(
    transactions: {
      amount: Decimal;
      category: { name: string; type: string };
    }[],
  ): { revenueLines: DreCategoryLine[]; expenseLines: DreCategoryLine[] } {
    const revenueMap = new Map<string, { total: number; count: number }>();
    const expenseMap = new Map<string, { total: number; count: number }>();

    for (const tx of transactions) {
      const map =
        tx.category.type === 'income' ? revenueMap : expenseMap;
      const name = tx.category.name;
      const current = map.get(name) ?? { total: 0, count: 0 };
      map.set(name, {
        total: current.total + Number(tx.amount),
        count: current.count + 1,
      });
    }

    const toLines = (m: Map<string, { total: number; count: number }>) =>
      [...m.entries()]
        .map(([category_name, v]) => ({
          category_name,
          total: Math.round(v.total * 100) / 100,
          count: v.count,
        }))
        .sort((a, b) => b.total - a.total);

    return { revenueLines: toLines(revenueMap), expenseLines: toLines(expenseMap) };
  }

  private async fetchPeriodSummary(
    tenantId: string,
    congregationId: string,
    costCenter: string | undefined,
    start: Date,
    end: Date,
  ): Promise<DrePeriodSummary> {
    const where: object = {
      tenant_id: tenantId,
      congregation_id: congregationId,
      occurred_at: { gte: start, lte: end },
      ...(costCenter ? { costCenter: { name: costCenter } } : {}),
    };

    const txs = await this.prisma.client.financialTransaction.findMany({
      where,
      include: { category: { select: { type: true } } },
    });

    let revTotal = 0;
    let expTotal = 0;
    for (const tx of txs) {
      if (tx.category.type === 'income') revTotal += Number(tx.amount);
      else expTotal += Number(tx.amount);
    }

    return {
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      revenue_total: Math.round(revTotal * 100) / 100,
      expenses_total: Math.round(expTotal * 100) / 100,
      net_result: Math.round((revTotal - expTotal) * 100) / 100,
    };
  }

  /** Returns a period of the same length immediately preceding [start, end]. */
  private previousPeriod(start: Date, end: Date): { start: Date; end: Date } {
    const lengthMs = end.getTime() - start.getTime() + 1;
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - lengthMs + 1);
    return { start: prevStart, end: prevEnd };
  }
}
