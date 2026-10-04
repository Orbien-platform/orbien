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

interface WeeklyDashboard {
  weekly: { week_start: string; week_end: string; income: number; expense: number; net: number }[];
  current_month: { income: number; expense: number; net: number; vs_last_month_pct: number | null };
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

function weekLabel(weekStart: string, index: number): string {
  void weekStart;
  return `Sem ${index + 1}`;
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
 * "Dashboard de entradas semanais" — ✅ nos dois planos
 * (`apps/api/.../dashboard.controller.ts`, rota `weekly` fora do gate).
 * Busca por conta própria, sem depender de `/financial/transactions`: as
 * duas fontes já divergiam (ver `.specs/features/financeiro-ui-premium`).
 */
export function WeeklyDashboardCard() {
  const [data, setData] = useState<WeeklyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<WeeklyDashboard>("/financial/dashboard/weekly")
      .then((res) => {
        setData(res.data);
        setAccessDenied(false);
        setLoadError(false);
      })
      .catch((error) => {
        if (isForbidden(error)) {
          setAccessDenied(true);
        } else {
          setLoadError(true);
        }
      })
      .finally(() => setLoading(false));
  }, []);

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

  const chartData = (data?.weekly ?? []).map((w, i) => ({
    week: weekLabel(w.week_start, i),
    Entradas: w.income,
    Saídas: w.expense,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Receitas" value={data?.current_month.income ?? 0} loading={loading} variant="positive" />
        <KpiCard label="Despesas" value={data?.current_month.expense ?? 0} loading={loading} variant="negative" />
        <KpiCard
          label="Resultado"
          value={data?.current_month.net ?? 0}
          loading={loading}
          variant={(data?.current_month.net ?? 0) >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
        <p className="mb-4 text-sm font-medium text-ink dark:text-white">Entradas e saídas por semana</p>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : chartData.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone">Sem lançamentos nas últimas 8 semanas.</p>
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
