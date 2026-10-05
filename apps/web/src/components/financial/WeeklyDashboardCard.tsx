"use client";

import { useEffect, useRef, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { cn } from "@/lib/utils";
import { isValidRange, type Period } from "@/lib/period";

interface WeeklyDashboard {
  period: { start: string; end: string; granularity: "week" | "month" };
  series: { start: string; end: string; income: number; expense: number; net: number }[];
  totals: { income: number; expense: number; net: number; vs_previous_pct: number | null };
  top_income_categories: { category_name: string; total: number }[];
  average_per_contributor: number;
  tithe_active_count: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Rótulo do eixo: "05/10" para semana (dia em que começa), "out/26" para mês. */
function bucketLabel(start: string, granularity: "week" | "month"): string {
  const [y, m, d] = start.split("-");
  if (granularity === "month") return `${MONTHS_SHORT[Number(m) - 1]}/${y.slice(2)}`;
  return `${d}/${m}`;
}

function KpiCard({
  label,
  value,
  loading,
  variant,
}: {
  label: string;
  value: number;
  loading: boolean;
  variant: "positive" | "negative";
}) {
  const color = variant === "positive" ? "text-teal" : "text-crimson";
  return (
    <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
      <p className="text-xs font-medium text-stone">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className={cn("mt-1 text-2xl font-medium tabular-nums", color)}>{fmt(value)}</p>
      )}
    </div>
  );
}

/**
 * Visão Geral do financeiro — ✅ nos dois planos
 * (`apps/api/.../dashboard.controller.ts`, rota `weekly` fora do gate).
 * Busca por conta própria, sem depender de `/financial/transactions`: as
 * duas fontes já divergiram (ver `.specs/features/financeiro-ui-premium`).
 *
 * O período vem da tela (`PeriodNavigator`). Cada troca refaz a busca, e uma
 * resposta que chega depois de o usuário já ter trocado de novo é descartada —
 * senão o período antigo pintaria por cima do atual.
 */
export function WeeklyDashboardCard({ period }: { period: Period }) {
  const [data, setData] = useState<WeeklyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const lastKey = useRef<string | null>(null);
  const seq = useRef(0);

  const { start, end } = period;
  const valid = isValidRange(start, end);

  useEffect(() => {
    if (!valid) return;
    // Guarda contra a dupla invocação de efeito do StrictMode: mesmo período,
    // mesma busca.
    const key = `${start}|${end}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    const mine = ++seq.current;
    setLoading(true);
    api
      .get<WeeklyDashboard>(`/financial/dashboard/weekly?period_start=${start}&period_end=${end}`)
      .then((res) => {
        if (mine !== seq.current) return;
        setData(res.data);
        setAccessDenied(false);
        setLoadError(false);
      })
      .catch((error) => {
        if (mine !== seq.current) return;
        if (isForbidden(error)) {
          setAccessDenied(true);
        } else {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false);
      });
  }, [start, end, valid]);

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="Financeiro" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center">
        <p className="text-sm text-crimson">Erro ao carregar o dashboard semanal. Tente de novo.</p>
      </div>
    );
  }

  const granularity = data?.period.granularity ?? "week";
  const chartData = (data?.series ?? []).map((b) => ({
    week: bucketLabel(b.start, granularity),
    Entradas: b.income,
    Saídas: b.expense,
  }));
  const hasMovement = chartData.some((b) => b.Entradas !== 0 || b.Saídas !== 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Receitas" value={data?.totals.income ?? 0} loading={loading} variant="positive" />
        <KpiCard label="Despesas" value={data?.totals.expense ?? 0} loading={loading} variant="negative" />
        <KpiCard
          label="Resultado"
          value={data?.totals.net ?? 0}
          loading={loading}
          variant={(data?.totals.net ?? 0) >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
        <p className="mb-4 text-sm font-medium text-ink dark:text-white">
          Entradas e saídas por {granularity === "month" ? "mês" : "semana"}
        </p>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : !hasMovement ? (
          <p className="py-10 text-center text-sm text-stone">Sem lançamentos neste período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => [fmt(Number(value))]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-card)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="Entradas" fill="#00b8a2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Saídas" fill="#c0392b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
