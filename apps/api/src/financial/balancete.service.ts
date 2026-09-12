import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceteQueryDto } from './dto/balancete-query.dto';

const SEM_CENTRO_CUSTO = 'Sem centro de custo';

export interface BalanceteLine {
  cost_center_id: string | null;
  cost_center_name: string;
  revenue_total: number;
  expenses_total: number;
  net_result: number;
  count: number;
}

export interface BalanceteResult {
  period: { start: string; end: string };
  lines: BalanceteLine[];
  revenue_total: number;
  expenses_total: number;
  net_result: number;
}

@Injectable()
export class BalanceteService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, query: BalanceteQueryDto): Promise<BalanceteResult> {
    const start = new Date(query.period_start);
    const end = new Date(query.period_end);
    end.setUTCHours(23, 59, 59, 999);

    const transactions = await this.prisma.client.financialTransaction.findMany({
      where: {
        tenant_id: tenantId,
        occurred_at: { gte: start, lte: end },
        ...(query.congregation_id ? { congregation_id: query.congregation_id } : {}),
      },
      include: {
        category: { select: { type: true } },
        costCenter: { select: { id: true, name: true } },
      },
    });

    const lines = this.groupByCostCenter(transactions);
    const revenueTotal = lines.reduce((s, l) => s + l.revenue_total, 0);
    const expensesTotal = lines.reduce((s, l) => s + l.expenses_total, 0);

    return {
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      lines,
      revenue_total: Math.round(revenueTotal * 100) / 100,
      expenses_total: Math.round(expensesTotal * 100) / 100,
      net_result: Math.round((revenueTotal - expensesTotal) * 100) / 100,
    };
  }

  private groupByCostCenter(
    transactions: {
      amount: Decimal;
      category: { type: string };
      costCenter: { id: string; name: string } | null;
    }[],
  ): BalanceteLine[] {
    const map = new Map<
      string,
      { cost_center_id: string | null; cost_center_name: string; revenue_total: number; expenses_total: number; count: number }
    >();

    for (const tx of transactions) {
      const key = tx.costCenter?.id ?? '__none__';
      const current = map.get(key) ?? {
        cost_center_id: tx.costCenter?.id ?? null,
        cost_center_name: tx.costCenter?.name ?? SEM_CENTRO_CUSTO,
        revenue_total: 0,
        expenses_total: 0,
        count: 0,
      };

      if (tx.category.type === 'income') {
        current.revenue_total += Number(tx.amount);
      } else {
        current.expenses_total += Number(tx.amount);
      }
      current.count += 1;

      map.set(key, current);
    }

    return [...map.values()]
      .map((l) => ({
        ...l,
        revenue_total: Math.round(l.revenue_total * 100) / 100,
        expenses_total: Math.round(l.expenses_total * 100) / 100,
        net_result: Math.round((l.revenue_total - l.expenses_total) * 100) / 100,
      }))
      .sort((a, b) => b.revenue_total + b.expenses_total - (a.revenue_total + a.expenses_total));
  }
}
