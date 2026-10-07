"use client";

import { cn } from "@/lib/utils";
import { fmt } from "./dreFormat";

export interface CostCenterChartLine {
  cost_center_id: string | null;
  cost_center_name: string;
  revenue_total: number;
  expenses_total: number;
  net_result: number;
}

/**
 * Divide 100% entre os valores sem que a soma dos inteiros saia de 100
 * (maior resto). Arredondar cada fatia isoladamente deixa 99% ou 101%.
 */
export function sharesOf(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let missing = 100 - floors.reduce((s, v) => s + v, 0);
  const byRemainder = exact
    .map((v, i) => ({ i, rest: v - floors[i] }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    floors[i] += 1;
    missing -= 1;
  }
  return floors;
}

const track = "h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]";

// SPEC_DEVIATION: a spec sugere `recharts`; são barras horizontais simples (largura proporcional),
// feitas em HTML para que cada barra tenha texto e `aria-label` próprios e sem depender de SVG responsivo.
// Reason: o valor está sempre escrito ao lado da barra, e a tabela do Balancete segue como equivalente textual.

/**
 * Leitura gráfica do Balancete: receita × despesa por centro, e quanto cada
 * centro pesa nas despesas. Mesma ordem da tabela. Cor nunca carrega sozinha:
 * toda barra traz o valor por extenso.
 */
export function CostCenterCharts({ lines }: { lines: CostCenterChartLine[] }) {
  const max = Math.max(0, ...lines.flatMap((l) => [l.revenue_total, l.expenses_total]));
  if (lines.length === 0 || max <= 0) return null;

  const expenseShares = sharesOf(lines.map((l) => l.expenses_total));
  const expenseRows = lines
    .map((l, i) => ({ line: l, share: expenseShares[i] }))
    .filter((r) => r.line.expenses_total > 0)
    .sort((a, b) => b.line.expenses_total - a.line.expenses_total);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section
        aria-labelledby="balancete-chart-compare"
        className="space-y-3 rounded-[12px] border border-[var(--border-default)] p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="balancete-chart-compare" className="text-sm font-semibold text-ink dark:text-white">
            Receitas e despesas por centro
          </h3>
          <p className="flex items-center gap-3 text-xs text-stone">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2 rounded-full bg-teal" />
              Receitas
            </span>
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2 rounded-full bg-crimson" />
              Despesas
            </span>
          </p>
        </div>
        <ul className="space-y-4">
          {lines.map((l) => (
            <li key={l.cost_center_id ?? "__none__"}>
              {/* `role="img"` no <li> apagaria a semântica de lista; fica no bloco de dentro. */}
              <div
                role="img"
                aria-label={`${l.cost_center_name}: receitas ${fmt(l.revenue_total)}, despesas ${fmt(l.expenses_total)}`}
                className="space-y-1.5"
              >
              <p className="text-xs font-medium text-ink dark:text-white">
                {l.cost_center_name}:{" "}
                {l.net_result === 0
                  ? "resultado zerado"
                  : `${l.net_result > 0 ? "lucro" : "prejuízo"} ${fmt(Math.abs(l.net_result))}`}
              </p>
              {(
                [
                  ["Receitas", l.revenue_total, "bg-teal"],
                  ["Despesas", l.expenses_total, "bg-crimson"],
                ] as const
              ).map(([label, value, color]) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={track}>
                    <div
                      className={cn("h-full rounded-full", color)}
                      style={{ width: `${(value / max) * 100}%` }}
                    />
                  </div>
                  <span className="w-32 shrink-0 text-right text-xs tabular-nums text-stone">
                    {label} {fmt(value)}
                  </span>
                </div>
              ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {expenseRows.length > 0 && (
        <section
          aria-labelledby="balancete-chart-share"
          className="space-y-3 rounded-[12px] border border-[var(--border-default)] p-4"
        >
          <h3 id="balancete-chart-share" className="text-sm font-semibold text-ink dark:text-white">
            Participação nas despesas
          </h3>
          <ol className="space-y-3">
            {expenseRows.map(({ line, share }) => (
              <li key={line.cost_center_id ?? "__none__"}>
                <div
                  role="img"
                  aria-label={`${line.cost_center_name}: ${share}% das despesas, ${fmt(line.expenses_total)}`}
                  className="space-y-1"
                >
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="font-medium text-ink dark:text-white">
                    {line.cost_center_name}: {share}% das despesas
                  </span>
                  <span className="tabular-nums text-stone">{fmt(line.expenses_total)}</span>
                </div>
                <div className={track}>
                  <div className="h-full rounded-full bg-navy" style={{ width: `${share}%` }} />
                </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
