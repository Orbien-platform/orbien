import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';
import { REALIZED_STATUSES, buildScope, round2 } from './dre-scope';

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

/** Lançamentos `pending` do período: informativo ("A realizar"), fora do resultado. */
export interface DrePending {
  revenue_total: number;
  expenses_total: number;
}

export interface DreResult {
  period: { start: string; end: string };
  revenue: { categories: DreCategoryLine[]; total: number };
  expenses: { categories: DreCategoryLine[]; total: number };
  net_result: number;
  pending: DrePending;
  previous_period: DrePeriodSummary;
}

export interface DreQuery {
  period_start: string;
  period_end: string;
  congregation_id?: string;
  /** Compatibilidade: filtro por nome. `cost_center_id` vence. */
  cost_center?: string;
  /** UUID do centro ou `none` (sem centro). */
  cost_center_id?: string;
}

@Injectable()
export class DreService {
  constructor(private readonly prisma: PrismaService) {}

  async buildDre(
    tenantId: string,
    // Continua no contrato porque o controller e o `dre-pdf.service` passam a
    // congregação do token, mas o DRE não a usa mais: o recorte de congregação
    // vem só da query, e o padrão é o tenant inteiro nos DOIS períodos. A
    // fronteira de isolamento é o tenant, não a congregação — ver a decisão de
    // 2026-09-03 em docs/PENDENCIAS.md.
    _congregationId: string,
    query: DreQuery,
    isPastor: boolean,
  ): Promise<DreResult> {
    const start = new Date(query.period_start);
    const end = new Date(query.period_end);
    end.setUTCHours(23, 59, 59, 999);

    const where = buildScope({
      tenantId,
      start,
      end,
      congregationId: query.congregation_id,
      costCenterId: query.cost_center_id,
      costCenterName: query.cost_center,
      statuses: REALIZED_STATUSES,
    });

    const transactions = await this.prisma.client.financialTransaction.findMany(
      {
        where,
        include: {
          category: { select: { name: true, type: true } },
        },
      },
    );

    const { revenueLines, expenseLines } = this.groupByCategory(transactions);

    const revenueTotal = round2(revenueLines.reduce((s, l) => s + l.total, 0));
    const expensesTotal = round2(expenseLines.reduce((s, l) => s + l.total, 0));

    // O período anterior usa EXATAMENTE o mesmo escopo de congregação do
    // período atual. Antes caía para a congregação do token quando a query não
    // mandava nenhuma (`query.congregation_id ?? congregationId`), enquanto o
    // período atual ficava com o tenant inteiro — os dois lados do relatório
    // comparavam recortes diferentes, e o "período anterior" aparecia menor
    // sem que nada tivesse caído.
    const prev = this.previousPeriod(start, end);
    const prevSummary = await this.fetchPeriodSummary(
      tenantId,
      query,
      prev.start,
      prev.end,
    );
    const pending = await this.fetchPending(tenantId, query, start, end);

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
      net_result: round2(revenueTotal - expensesTotal),
      pending,
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
    query: DreQuery,
    start: Date,
    end: Date,
  ): Promise<DrePeriodSummary> {
    const { revenue, expenses } = await this.sumByType(
      tenantId,
      query,
      start,
      end,
      REALIZED_STATUSES,
    );

    return {
      period: {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      },
      revenue_total: round2(revenue),
      expenses_total: round2(expenses),
      net_result: round2(revenue - expenses),
    };
  }

  /** "A realizar": só `pending`, mesmo período e mesmo recorte do DRE. */
  private async fetchPending(
    tenantId: string,
    query: DreQuery,
    start: Date,
    end: Date,
  ): Promise<DrePending> {
    const { revenue, expenses } = await this.sumByType(tenantId, query, start, end, ['pending']);
    return { revenue_total: round2(revenue), expenses_total: round2(expenses) };
  }

  private async sumByType(
    tenantId: string,
    query: DreQuery,
    start: Date,
    end: Date,
    statuses: Parameters<typeof buildScope>[0]['statuses'],
  ): Promise<{ revenue: number; expenses: number }> {
    const txs = await this.prisma.client.financialTransaction.findMany({
      where: buildScope({
        tenantId,
        start,
        end,
        congregationId: query.congregation_id,
        costCenterId: query.cost_center_id,
        costCenterName: query.cost_center,
        statuses,
      }),
      include: { category: { select: { type: true } } },
    });

    let revenue = 0;
    let expenses = 0;
    for (const tx of txs) {
      if (tx.category.type === 'income') revenue += Number(tx.amount);
      else expenses += Number(tx.amount);
    }
    return { revenue, expenses };
  }

  /**
   * Período imediatamente anterior a [start, end], para a coluna de
   * comparação do DRE.
   *
   * Quando o período pedido são **meses inteiros** — começa no dia 1 e termina
   * no último dia de um mês — o anterior é o mesmo número de meses de
   * calendário: fevereiro compara com janeiro inteiro, e não com "os 28 dias
   * anteriores a 01/02", que era o que a conta por comprimento devolvia
   * (04/01–31/01, deixando três dias de janeiro fora da comparação).
   *
   * Para qualquer outro recorte — 15/01 a 14/02, uma semana, um dia — não
   * existe "mês anterior" que faça sentido, e a conta por comprimento continua
   * sendo a resposta certa.
   */
  private previousPeriod(start: Date, end: Date): { start: Date; end: Date } {
    const prevEnd = new Date(start.getTime() - 1);

    if (this.spansWholeMonths(start, end)) {
      const months =
        (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
        (end.getUTCMonth() - start.getUTCMonth()) +
        1;

      const prevStart = new Date(start);
      prevStart.setUTCFullYear(start.getUTCFullYear(), start.getUTCMonth() - months, 1);
      return { start: prevStart, end: prevEnd };
    }

    const lengthMs = end.getTime() - start.getTime() + 1;
    return { start: new Date(prevEnd.getTime() - lengthMs + 1), end: prevEnd };
  }

  /** Começa no dia 1 e termina no último dia do mês do `end`. */
  private spansWholeMonths(start: Date, end: Date): boolean {
    const lastDayOfEndMonth = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
    ).getUTCDate();

    return start.getUTCDate() === 1 && end.getUTCDate() === lastDayOfEndMonth;
  }
}
