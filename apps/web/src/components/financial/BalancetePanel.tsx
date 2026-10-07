"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { CostCenterCharts } from "@/components/financial/CostCenterCharts";
import api, { isForbidden } from "@/lib/api";
import { cn } from "@/lib/utils";

interface BalanceteLine {
  cost_center_id: string | null;
  cost_center_name: string;
  revenue_total: number;
  expenses_total: number;
  net_result: number;
  count: number;
}

interface Balancete {
  period: { start: string; end: string };
  lines: BalanceteLine[];
  revenue_total: number;
  expenses_total: number;
  net_result: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function firstOfMonthIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().split("T")[0];
}

const dateInput =
  "h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white";

/**
 * Balancete por centro de custo (Premium — `GET /financial/balancete`).
 * Lançamentos sem centro de custo aparecem numa linha própria, que a API já
 * devolve; o total fecha com a soma das linhas.
 */
export function BalancetePanel() {
  const [start, setStart] = useState(firstOfMonthIso);
  const [end, setEnd] = useState(todayIso);
  const [data, setData] = useState<Balancete | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const requestSeq = useRef(0);
  const prevKey = useRef("");

  const load = useCallback((from: string, to: string) => {
    // Data apagada no input: não há período para pedir.
    if (!from || !to) {
      setData(null);
      setLoading(false);
      setLoadError(false);
      return;
    }
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(false);
    api
      .get<Balancete>(`/financial/balancete?period_start=${from}&period_end=${to}`)
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setData(res.data);
        setAccessDenied(false);
      })
      .catch((error) => {
        if (seq !== requestSeq.current) return;
        if (isForbidden(error)) setAccessDenied(true);
        else setLoadError(true);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const key = `${start}|${end}`;
    if (prevKey.current === key) return;
    prevKey.current = key;
    load(start, end);
  }, [start, end, load]);

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="Balancete" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          aria-label="Início do período"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className={dateInput}
        />
        <span className="text-xs text-stone">até</span>
        <input
          type="date"
          aria-label="Fim do período"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className={dateInput}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : loadError ? (
        <p className="py-10 text-center text-sm text-crimson">
          Erro ao carregar o balancete. Tente de novo.
        </p>
      ) : !data ? (
        <p className="py-10 text-center text-sm text-stone">
          Selecione um período para ver o balancete.
        </p>
      ) : (
        <>
        <CostCenterCharts lines={data.lines} />
        <div className="overflow-x-auto rounded-[12px] border border-[var(--border-default)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--surface-subtle)]">
                <th className="py-2.5 pl-4 text-left text-xs font-medium text-stone">Centro de custo</th>
                <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Receitas</th>
                <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Despesas</th>
                <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Resultado</th>
                <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Lançamentos</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 pl-4 text-xs text-stone">
                    Sem lançamentos no período
                  </td>
                </tr>
              ) : (
                data.lines.map((line) => (
                  <tr
                    key={line.cost_center_id ?? "__none__"}
                    className="border-t border-[var(--border-default)] transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <td className="py-2.5 pl-4 text-sm text-ink dark:text-white">{line.cost_center_name}</td>
                    <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-ink dark:text-white">
                      {fmt(line.revenue_total)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-ink dark:text-white">
                      {fmt(line.expenses_total)}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 pr-4 text-right text-sm font-medium tabular-nums",
                        line.net_result >= 0 ? "text-teal" : "text-crimson",
                      )}
                    >
                      {fmt(line.net_result)}
                    </td>
                    <td className="py-2.5 pr-4 text-right text-xs text-stone">{line.count}</td>
                  </tr>
                ))
              )}
              <tr className="border-t-2 border-[var(--border-default)] bg-[var(--surface-subtle)]">
                <td className="py-3 pl-4 text-sm font-semibold text-ink dark:text-white">Total</td>
                <td className="py-3 pr-4 text-right text-sm font-semibold tabular-nums text-ink dark:text-white">
                  {fmt(data.revenue_total)}
                </td>
                <td className="py-3 pr-4 text-right text-sm font-semibold tabular-nums text-ink dark:text-white">
                  {fmt(data.expenses_total)}
                </td>
                <td
                  className={cn(
                    "py-3 pr-4 text-right text-sm font-semibold tabular-nums",
                    data.net_result >= 0 ? "text-teal" : "text-crimson",
                  )}
                >
                  {fmt(data.net_result)}
                </td>
                <td className="py-3 pr-4 text-right text-xs text-stone">—</td>
              </tr>
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
