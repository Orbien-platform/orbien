"use client";

import { TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { ExportButton } from "@/components/financial/ExportButton";
import { DrePdfButton } from "@/components/financial/DrePdfButton";
import { cn } from "@/lib/utils";
import { dateInputClass, fmt, resultLabel, resultToneClass } from "./dreFormat";
import { ALL_CENTERS, NO_CENTER, type DreModel } from "./useDreReport";

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function DeltaCell({ current, previous }: { current: number; previous: number }) {
  const delta = deltaPercent(current, previous);
  if (delta === null) return <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>;
  const pos = delta >= 0;
  return (
    <td className="py-2.5 pr-4 text-right">
      <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", pos ? "text-teal" : "text-crimson")}>
        {pos ? <TrendingUp size={11} strokeWidth={2} /> : <TrendingDown size={11} strokeWidth={2} />}
        {Math.abs(delta).toFixed(1)}%
      </span>
    </td>
  );
}

interface DrePanelProps {
  /** Estado e busca vêm de `useDreReport`, chamado na page. */
  model: DreModel;
  /** Pastor vê só contagens e variação: sem valores, resultado nem exportação. */
  isPastor: boolean;
}

/**
 * Aba DRE do financeiro (Premium — `GET /financial/dre`). O resultado é o
 * realizado (pago + confirmado); o que ainda não foi pago aparece em "A realizar".
 */
export function DrePanel({ model, isPastor }: DrePanelProps) {
  const { start, end, costCenterId, costCenters, dre, loading, accessDenied, setStart, setEnd, setCostCenterId } = model;

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="DRE" />
      </div>
    );
  }

  const pending = dre?.pending;
  const hasPending = !!pending && (pending.revenue_total > 0 || pending.expenses_total > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Início do período"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className={dateInputClass}
          />
          <span className="text-xs text-stone">até</span>
          <input
            type="date"
            aria-label="Fim do período"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className={dateInputClass}
          />
          {!isPastor && (
            <select
              aria-label="Centro de custo"
              value={costCenterId}
              onChange={(e) => setCostCenterId(e.target.value)}
              className={dateInputClass}
            >
              <option value={ALL_CENTERS}>Todos os centros</option>
              <option value={NO_CENTER}>Lançamentos sem centro</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {!isPastor && (
          <div className="flex flex-wrap items-start justify-end gap-2">
            <DrePdfButton periodStart={start} periodEnd={end} costCenterId={costCenterId} />
            <ExportButton periodStart={start} periodEnd={end} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !dre ? (
        <p className="py-10 text-center text-sm text-stone">Selecione um período para ver o DRE.</p>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-[var(--border-default)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--surface-subtle)]">
                <th className="py-2.5 pl-4 text-left text-xs font-medium text-stone">Conta</th>
                {!isPastor && <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Total</th>}
                <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Qtd</th>
                <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Δ período ant.</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--border-default)] bg-[var(--surface-subtle)]">
                <td className="py-2.5 pl-4 text-xs font-semibold text-stone">Receitas</td>
                {!isPastor && (
                  <td className="py-2.5 pr-4 text-right text-sm font-semibold tabular-nums text-ink dark:text-white">
                    {fmt(dre.revenue.total)}
                  </td>
                )}
                <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>
                <DeltaCell current={dre.revenue.total} previous={dre.previous_period.revenue_total} />
              </tr>
              {dre.revenue.categories.length === 0 ? (
                <tr>
                  <td colSpan={isPastor ? 3 : 4} className="py-2 pl-8 text-xs text-stone">Sem lançamentos</td>
                </tr>
              ) : (
                dre.revenue.categories.map((cat) => (
                  <tr key={cat.category_name} className="border-t border-[var(--border-default)] transition-colors hover:bg-[var(--surface-subtle)]">
                    <td className="py-2.5 pl-8 text-sm text-ink dark:text-white">{cat.category_name}</td>
                    {!isPastor && (
                      <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-ink dark:text-white">{fmt(cat.total)}</td>
                    )}
                    <td className="py-2.5 pr-4 text-right text-xs text-stone">{cat.count}</td>
                    <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>
                  </tr>
                ))
              )}

              <tr className="border-t border-[var(--border-default)] bg-[var(--surface-subtle)]">
                <td className="py-2.5 pl-4 text-xs font-semibold text-stone">Despesas</td>
                {!isPastor && (
                  <td className="py-2.5 pr-4 text-right text-sm font-semibold tabular-nums text-ink dark:text-white">
                    {fmt(dre.expenses.total)}
                  </td>
                )}
                <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>
                <DeltaCell current={dre.expenses.total} previous={dre.previous_period.expenses_total} />
              </tr>
              {dre.expenses.categories.length === 0 ? (
                <tr>
                  <td colSpan={isPastor ? 3 : 4} className="py-2 pl-8 text-xs text-stone">Sem lançamentos</td>
                </tr>
              ) : (
                dre.expenses.categories.map((cat) => (
                  <tr key={cat.category_name} className="border-t border-[var(--border-default)] transition-colors hover:bg-[var(--surface-subtle)]">
                    <td className="py-2.5 pl-8 text-sm text-ink dark:text-white">{cat.category_name}</td>
                    {!isPastor && (
                      <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-ink dark:text-white">{fmt(cat.total)}</td>
                    )}
                    <td className="py-2.5 pr-4 text-right text-xs text-stone">{cat.count}</td>
                    <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>
                  </tr>
                ))
              )}

              <tr className="border-t-2 border-[var(--border-default)] bg-[var(--surface-subtle)]">
                <td className="py-3 pl-4 text-sm font-semibold text-ink dark:text-white">Resultado líquido</td>
                {!isPastor && (
                  <td className="py-3 pr-4 text-right">
                    <span className={cn("block text-xs font-medium", resultToneClass(dre.net_result))}>
                      {resultLabel(dre.net_result)}
                    </span>
                    <span className={cn("block text-sm font-semibold tabular-nums", resultToneClass(dre.net_result))}>
                      {fmt(dre.net_result)}
                    </span>
                  </td>
                )}
                <td className="py-3 pr-4 text-right text-xs text-stone">—</td>
                <DeltaCell current={dre.net_result} previous={dre.previous_period.net_result} />
              </tr>

              {!isPastor && hasPending && pending && (
                <tr className="border-t border-[var(--border-default)]">
                  <td className="py-2.5 pl-4 text-xs text-stone">
                    A realizar
                    <span className="block text-[11px]">Ainda não pago nem recebido; fora do resultado</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-xs tabular-nums text-stone">
                    <span className="block">Receitas {fmt(pending.revenue_total)}</span>
                    <span className="block">Despesas {fmt(pending.expenses_total)}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>
                  <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
