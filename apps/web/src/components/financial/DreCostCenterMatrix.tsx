"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { cn } from "@/lib/utils";
import { fmt, resultShortLabel, resultToneClass } from "./dreFormat";
import type { DreMatrix, DreMatrixRow } from "./useDreReport";

const NONE_KEY = "__none__";

interface DreCostCenterMatrixProps {
  matrix: DreMatrix | null;
  loading: boolean;
  accessDenied: boolean;
}

const stickyCell = "sticky left-0 z-[1]";

/**
 * DRE comparativo: categorias nas linhas, centros de custo nas colunas, e o
 * lucro ou prejuízo de cada centro na última linha. Só lançamentos realizados,
 * o mesmo critério do DRE — a coluna "Total" fecha com o resultado dele.
 */
export function DreCostCenterMatrix({ matrix, loading, accessDenied }: DreCostCenterMatrixProps) {
  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="DRE por centro de custo" />
      </div>
    );
  }
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!matrix) return null;

  const { columns, totals } = matrix;

  function amountCells(row: DreMatrixRow) {
    return columns.map((c) => {
      const value = row.cells[c.cost_center_id ?? NONE_KEY] ?? 0;
      return (
        <td
          key={c.cost_center_id ?? NONE_KEY}
          className={cn("py-2.5 pr-4 text-right text-sm tabular-nums", value === 0 ? "text-stone" : "text-ink dark:text-white")}
        >
          {value === 0 ? "—" : fmt(value)}
        </td>
      );
    });
  }

  function sectionRow(title: string, perColumn: (c: DreMatrix["columns"][number]) => number, total: number) {
    return (
      <tr className="border-t border-[var(--border-default)] [&>*]:bg-[var(--surface-subtle)]">
        <td className={cn(stickyCell, "py-2.5 pl-4 text-xs font-semibold text-stone")}>{title}</td>
        {columns.map((c) => (
          <td
            key={c.cost_center_id ?? NONE_KEY}
            className="py-2.5 pr-4 text-right text-sm font-semibold tabular-nums text-ink dark:text-white"
          >
            {fmt(perColumn(c))}
          </td>
        ))}
        <td className="py-2.5 pr-4 text-right text-sm font-semibold tabular-nums text-ink dark:text-white">{fmt(total)}</td>
      </tr>
    );
  }

  function categoryRows(rows: DreMatrixRow[]) {
    return rows.map((row) => (
      <tr key={row.category_name} className="border-t border-[var(--border-default)] transition-colors hover:bg-[var(--surface-subtle)]">
        <td className={cn(stickyCell, "bg-[var(--surface-card)] py-2.5 pl-8 pr-4 text-sm text-ink dark:text-white")}>
          {row.category_name}
        </td>
        {amountCells(row)}
        <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-ink dark:text-white">{fmt(row.total)}</td>
      </tr>
    ));
  }

  return (
    <section aria-labelledby="dre-by-center-title" className="space-y-3">
      <div>
        <h3 id="dre-by-center-title" className="text-sm font-semibold text-ink dark:text-white">
          Resultado por centro de custo
        </h3>
        <p className="text-xs text-stone">Só lançamentos pagos ou confirmados, como no DRE acima.</p>
      </div>

      {columns.length === 0 ? (
        <p className="rounded-[12px] border border-[var(--border-default)] py-8 text-center text-sm text-stone">
          Sem lançamentos no período
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[12px] border border-[var(--border-default)]">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] [&>*]:bg-[var(--surface-subtle)]">
                <th className={cn(stickyCell, "py-2.5 pl-4 pr-4 text-left text-xs font-medium text-stone")}>
                  Categoria
                </th>
                {columns.map((c) => (
                  <th
                    key={c.cost_center_id ?? NONE_KEY}
                    scope="col"
                    className="min-w-[8.5rem] py-2.5 pr-4 text-right text-xs font-medium text-stone"
                  >
                    {c.name}
                  </th>
                ))}
                <th scope="col" className="min-w-[8.5rem] py-2.5 pr-4 text-right text-xs font-medium text-stone">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {sectionRow("Total de receitas", (c) => c.revenue_total, totals.revenue_total)}
              {categoryRows(matrix.revenue)}
              {sectionRow("Total de despesas", (c) => c.expenses_total, totals.expenses_total)}
              {categoryRows(matrix.expenses)}
              <tr className="border-t-2 border-[var(--border-default)] [&>*]:bg-[var(--surface-subtle)]">
                <td className={cn(stickyCell, "py-3 pl-4 pr-4 text-sm font-semibold text-ink dark:text-white")}>
                  Resultado
                </td>
                {columns.map((c) => (
                  <td key={c.cost_center_id ?? NONE_KEY} className="py-3 pr-4 text-right">
                    <span className={cn("block text-xs font-medium", resultToneClass(c.net_result))}>
                      {resultShortLabel(c.net_result)}
                    </span>
                    <span className={cn("block text-sm font-semibold tabular-nums", resultToneClass(c.net_result))}>
                      {fmt(c.net_result)}
                    </span>
                  </td>
                ))}
                <td className="py-3 pr-4 text-right">
                  <span className={cn("block text-xs font-medium", resultToneClass(totals.net_result))}>
                    {resultShortLabel(totals.net_result)}
                  </span>
                  <span className={cn("block text-sm font-semibold tabular-nums", resultToneClass(totals.net_result))}>
                    {fmt(totals.net_result)}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
