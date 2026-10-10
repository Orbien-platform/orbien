import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceteQueryDto } from './dto/balancete-query.dto';
import { REALIZED_STATUSES, buildScope, round2 } from './dre-scope';

const SEM_CENTRO_CUSTO = 'Sem centro de custo';

/** Chave da coluna "Sem centro de custo" em `cells`. */
export const NONE_KEY = '__none__';

export interface DreCostCenterColumn {
  cost_center_id: string | null;
  name: string;
  revenue_total: number;
  expenses_total: number;
  net_result: number;
}

export interface DreCostCenterRow {
  category_name: string;
  /** Uma entrada por coluna (cost_center_id, ou `__none__`), com zero onde não há lançamento. */
  cells: Record<string, number>;
  total: number;
}

export interface DreCostCenterResult {
  period: { start: string; end: string };
  columns: DreCostCenterColumn[];
  revenue: DreCostCenterRow[];
  expenses: DreCostCenterRow[];
  totals: { revenue_total: number; expenses_total: number; net_result: number };
}

@Injectable()
export class DreCostCenterService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, query: BalanceteQueryDto): Promise<DreCostCenterResult> {
    const start = new Date(query.period_start);
    const end = new Date(query.period_end);
    end.setUTCHours(23, 59, 59, 999);

    const transactions = await this.prisma.client.financialTransaction.findMany({
      where: buildScope({
        tenantId,
        start,
        end,
        congregationId: query.congregation_id,
        statuses: REALIZED_STATUSES,
      }),
      include: {
        category: { select: { name: true, type: true } },
        costCenter: { select: { id: true, name: true } },
      },
    });

    return this.matrix(start, end, transactions);
  }

  private matrix(
    start: Date,
    end: Date,
    transactions: {
      amount: Decimal;
      category: { name: string; type: string };
      costCenter: { id: string; name: string } | null;
    }[],
  ): DreCostCenterResult {
    type Acc = { id: string | null; name: string; revenue: number; expenses: number };
    const columns = new Map<string, Acc>();
    const revenueRows = new Map<string, Map<string, number>>();
    const expenseRows = new Map<string, Map<string, number>>();

    for (const tx of transactions) {
      const key = tx.costCenter?.id ?? NONE_KEY;
      const amount = Number(tx.amount);
      const col = columns.get(key) ?? {
        id: tx.costCenter?.id ?? null,
        name: tx.costCenter?.name ?? SEM_CENTRO_CUSTO,
        revenue: 0,
        expenses: 0,
      };
      const isIncome = tx.category.type === 'income';
      if (isIncome) col.revenue += amount;
      else col.expenses += amount;
      columns.set(key, col);

      const rows = isIncome ? revenueRows : expenseRows;
      const cells = rows.get(tx.category.name) ?? new Map<string, number>();
      cells.set(key, (cells.get(key) ?? 0) + amount);
      rows.set(tx.category.name, cells);
    }

    // Colunas por nome; "Sem centro de custo" por último.
    const ordered = [...columns.entries()].sort(([ka, a], [kb, b]) => {
      if (ka === NONE_KEY) return 1;
      if (kb === NONE_KEY) return -1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
    const keys = ordered.map(([k]) => k);

    const toRows = (m: Map<string, Map<string, number>>): DreCostCenterRow[] =>
      [...m.entries()]
        .map(([category_name, cells]) => {
          const filled: Record<string, number> = {};
          let total = 0;
          for (const k of keys) {
            const v = cells.get(k) ?? 0;
            filled[k] = round2(v);
            total += v;
          }
          return { category_name, cells: filled, total: round2(total) };
        })
        .sort((a, b) => b.total - a.total);

    const revenueTotal = ordered.reduce((s, [, c]) => s + c.revenue, 0);
    const expensesTotal = ordered.reduce((s, [, c]) => s + c.expenses, 0);

    return {
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      columns: ordered.map(([, c]) => ({
        cost_center_id: c.id,
        name: c.name,
        revenue_total: round2(c.revenue),
        expenses_total: round2(c.expenses),
        net_result: round2(c.revenue - c.expenses),
      })),
      revenue: toRows(revenueRows),
      expenses: toRows(expenseRows),
      totals: {
        revenue_total: round2(revenueTotal),
        expenses_total: round2(expensesTotal),
        net_result: round2(revenueTotal - expensesTotal),
      },
    };
  }
}
