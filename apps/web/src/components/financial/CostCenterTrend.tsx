"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { cn } from "@/lib/utils";
import { dateInputClass, fmt, resultShortLabel, resultToneClass } from "./dreFormat";

const MAX_MONTHS = 36;
const MAX_MONTHS_MESSAGE = "Escolha um período de até 36 meses";
const ALL = "__all__";
const NONE_KEY = "__none__";
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

interface MonthPoint {
  month: string;
  revenue_total: number;
  expenses_total: number;
  net_result: number;
}

interface MonthlySeries {
  cost_center_id: string | null;
  name: string;
  points: MonthPoint[];
}

/** `GET /financial/balancete/monthly`: um ponto por mês, zeros onde não há lançamento. */
interface Monthly {
  period: { start: string; end: string };
  months: string[];
  series: MonthlySeries[];
}

/** Quantos meses de calendário o período toca; null se a data é inválida. */
export function monthsTouched(start: string, end: string): number | null {
  const s = /^(\d{4})-(\d{2})/.exec(start);
  const e = /^(\d{4})-(\d{2})/.exec(end);
  if (!s || !e) return null;
  return (Number(e[1]) - Number(s[1])) * 12 + (Number(e[2]) - Number(s[2])) + 1;
}

function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m}/${year.slice(2)}`;
}

const seriesKey = (s: MonthlySeries) => s.cost_center_id ?? NONE_KEY;

/**
 * Resultado mês a mês de um centro de custo (ou de todos). Positivo sobe da
 * linha de zero, negativo desce — a direção e o rótulo "lucro"/"prejuízo"
 * dizem o sinal, a cor só reforça. Só busca depois do clique.
 */
export function CostCenterTrend({ start, end }: { start: string; end: string }) {
  const [opened, setOpened] = useState(false);
  const [data, setData] = useState<Monthly | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [centerKey, setCenterKey] = useState(ALL);
  const requestSeq = useRef(0);
  const prevKey = useRef("");

  const key = `${start}|${end}`;
  const count = monthsTouched(start, end);
  const tooLong = count !== null && count > MAX_MONTHS;
  const canFetch = opened && !!start && !!end && count !== null && !tooLong;
  const loading = canFetch && loadedKey !== key;

  useEffect(() => {
    if (!canFetch || prevKey.current === key) return;
    prevKey.current = key;
    const seq = ++requestSeq.current;
    api
      .get<Monthly>(`/financial/balancete/monthly?period_start=${start}&period_end=${end}`)
      .then((r) => {
        if (seq !== requestSeq.current) return;
        setData(r.data);
        setAccessDenied(false);
        setFailed(false);
      })
      .catch((error) => {
        if (seq !== requestSeq.current) return;
        if (isForbidden(error)) setAccessDenied(true);
        else setFailed(true);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoadedKey(key);
      });
  }, [canFetch, key, start, end]);

  const points: MonthPoint[] = useMemo(() => {
    if (!data) return [];
    if (centerKey === ALL) {
      return data.months.map((month) => {
        const sum = { month, revenue_total: 0, expenses_total: 0, net_result: 0 };
        for (const s of data.series) {
          const p = s.points.find((x) => x.month === month);
          if (!p) continue;
          sum.revenue_total += p.revenue_total;
          sum.expenses_total += p.expenses_total;
          sum.net_result += p.net_result;
        }
        return {
          month,
          revenue_total: Math.round(sum.revenue_total * 100) / 100,
          expenses_total: Math.round(sum.expenses_total * 100) / 100,
          net_result: Math.round(sum.net_result * 100) / 100,
        };
      });
    }
    return data.series.find((s) => seriesKey(s) === centerKey)?.points ?? [];
  }, [data, centerKey]);

  if (!opened) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="h-8 rounded-[8px] border border-[var(--border-default)] px-3 text-sm text-ink hover:bg-[var(--surface-subtle)] dark:text-white"
        >
          Ver evolução mensal
        </button>
      </div>
    );
  }

  const maxAbs = Math.max(0, ...points.map((p) => Math.abs(p.net_result)));

  return (
    <section
      aria-labelledby="balancete-trend-title"
      className="space-y-4 rounded-[12px] border border-[var(--border-default)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="balancete-trend-title" className="text-sm font-semibold text-ink dark:text-white">
          Evolução mensal do resultado
        </h3>
        {data && data.series.length > 0 && (
          <select
            aria-label="Centro de custo da evolução"
            value={centerKey}
            onChange={(e) => setCenterKey(e.target.value)}
            className={dateInputClass}
          >
            <option value={ALL}>Todos os centros</option>
            {data.series.map((s) => (
              <option key={seriesKey(s)} value={seriesKey(s)}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {tooLong ? (
        <p role="alert" className="py-6 text-center text-sm text-crimson">
          {MAX_MONTHS_MESSAGE}
        </p>
      ) : accessDenied ? (
        <NoAccessState resource="Evolução mensal" />
      ) : loading ? (
        <Skeleton className="h-44 w-full" />
      ) : failed ? (
        <p className="py-6 text-center text-sm text-crimson">Erro ao carregar a evolução mensal. Tente de novo.</p>
      ) : !data || data.series.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone">Sem lançamentos no período</p>
      ) : (
        <div className="overflow-x-auto">
          <ol className="flex min-w-max gap-2">
            {points.map((p) => {
              const half = maxAbs === 0 ? 0 : (Math.abs(p.net_result) / maxAbs) * 100;
              const negative = p.net_result < 0;
              return (
                <li
                  key={p.month}
                  role="img"
                  aria-label={`${monthLabel(p.month)}: ${resultShortLabel(p.net_result).toLowerCase()} ${fmt(p.net_result)}`}
                  className="flex w-[4.5rem] flex-col items-stretch gap-1.5 text-center"
                >
                  {/* Metade de cima = lucro, metade de baixo = prejuízo; a linha do meio é o zero. */}
                  <div className="grid h-36 grid-rows-2 border-b border-[var(--border-default)]">
                    <div className="flex items-end justify-center">
                      {p.net_result > 0 && (
                        <div className="w-6 rounded-t-[4px] bg-teal" style={{ height: `${half}%` }} />
                      )}
                    </div>
                    <div className="flex items-start justify-center">
                      {negative && <div className="w-6 rounded-b-[4px] bg-crimson" style={{ height: `${half}%` }} />}
                    </div>
                  </div>
                  <span className="text-xs text-stone">{monthLabel(p.month)}</span>
                  <span className={cn("text-xs font-medium tabular-nums", resultToneClass(p.net_result))}>
                    {fmt(p.net_result)}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-stone">Acima da linha: lucro. Abaixo: prejuízo.</p>
        </div>
      )}
    </section>
  );
}
