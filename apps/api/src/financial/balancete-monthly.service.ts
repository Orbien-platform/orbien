import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BalanceteQueryDto } from './dto/balancete-query.dto';
import { REALIZED_STATUSES, buildScope, round2 } from './dre-scope';

const SEM_CENTRO_CUSTO = 'Sem centro de custo';
const MAX_MONTHS = 36;

export interface BalanceteMonthlyPoint {
  /** AAAA-MM */
  month: string;
  revenue_total: number;
  expenses_total: number;
  net_result: number;
}

export interface BalanceteMonthlySeries {
  cost_center_id: string | null;
  name: string;
  points: BalanceteMonthlyPoint[];
}

export interface BalanceteMonthlyResult {
  period: { start: string; end: string };
  months: string[];
  series: BalanceteMonthlySeries[];
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

@Injectable()
export class BalanceteMonthlyService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, query: BalanceteQueryDto): Promise<BalanceteMonthlyResult> {
    const start = new Date(query.period_start);
    const end = new Date(query.period_end);
    end.setUTCHours(23, 59, 59, 999);

    const months = this.monthsBetween(start, end);
    if (months.length > MAX_MONTHS) {
      throw new BadRequestException(`Escolha um período de até ${MAX_MONTHS} meses`);
    }

    const transactions = await this.prisma.client.financialTransaction.findMany({
      where: buildScope({
        tenantId,
        start,
        end,
        congregationId: query.congregation_id,
        statuses: REALIZED_STATUSES,
      }),
      select: {
        amount: true,
        occurred_at: true,
        category: { select: { type: true } },
        costCenter: { select: { id: true, name: true } },
      },
    });

    type Acc = {
      id: string | null;
      name: string;
      byMonth: Map<string, { revenue: number; expenses: number }>;
    };
    const centers = new Map<string, Acc>();

    for (const tx of transactions) {
      const key = tx.costCenter?.id ?? '__none__';
      const acc = centers.get(key) ?? {
        id: tx.costCenter?.id ?? null,
        name: tx.costCenter?.name ?? SEM_CENTRO_CUSTO,
        byMonth: new Map(),
      };
      const m = monthKey(tx.occurred_at);
      const cell = acc.byMonth.get(m) ?? { revenue: 0, expenses: 0 };
      if (tx.category.type === 'income') cell.revenue += Number(tx.amount);
      else cell.expenses += Number(tx.amount);
      acc.byMonth.set(m, cell);
      centers.set(key, acc);
    }

    // Por nome; "Sem centro de custo" por último (mesma ordem da matriz do DRE).
    const ordered = [...centers.values()].sort((a, b) => {
      if (a.id === null) return 1;
      if (b.id === null) return -1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    return {
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      months,
      series: ordered.map((c) => ({
        cost_center_id: c.id,
        name: c.name,
        points: months.map((month) => {
          const cell = c.byMonth.get(month) ?? { revenue: 0, expenses: 0 };
          return {
            month,
            revenue_total: round2(cell.revenue),
            expenses_total: round2(cell.expenses),
            net_result: round2(cell.revenue - cell.expenses),
          };
        }),
      })),
    };
  }

  /** Meses de calendário (UTC) que o período toca, de `start` a `end`, inclusive. */
  private monthsBetween(start: Date, end: Date): string[] {
    const out: string[] = [];
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    const endY = end.getUTCFullYear();
    const endM = end.getUTCMonth();
    while (y < endY || (y === endY && m <= endM)) {
      out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      m += 1;
      if (m === 12) {
        m = 0;
        y += 1;
      }
    }
    return out;
  }
}
