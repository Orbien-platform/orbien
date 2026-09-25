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

interface Forecast {
  historical: { month: string; total: number }[];
  projected: { month: string; projected: number }[];
  monthly_average: number;
  recurring_monthly: number;
  months_of_history: number;
}

type Horizon = 3 | 6 | 12;

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function monthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

/**
 * "Gráfico de forecast" é Premium (`ForecastService`/`GET
 * /financial/dashboard/forecast/:months`). Histórico e projeção vêm em duas
 * listas separadas da API — mescladas aqui num único eixo de tempo, com
 * campos distintos (`historical`/`projected`) para o gráfico diferenciar
 * visualmente o que já aconteceu do que é estimativa.
 */
export function ForecastCard() {
  const [months, setMonths] = useState<Horizon>(6);
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const requestSeq = useRef(0);
  const prevMonths = useRef<Horizon | null>(null);

  useEffect(() => {
    if (prevMonths.current === months) return;
    prevMonths.current = months;
    const seq = ++requestSeq.current;
    setLoading(true);
    api
      .get<Forecast>(`/financial/dashboard/forecast/${months}`)
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setData(res.data);
        setAccessDenied(false);
      })
      .catch((error) => {
        if (seq !== requestSeq.current) return;
        setAccessDenied(isForbidden(error));
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [months]);

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="Forecast financeiro" />
      </div>
    );
  }

  const chartData = [
    ...(data?.historical ?? []).map((h) => ({ month: monthLabel(h.month), Histórico: h.total, Projeção: undefined })),
    ...(data?.projected ?? []).map((p) => ({ month: monthLabel(p.month), Histórico: undefined, Projeção: p.projected })),
  ];

  return (
    <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink dark:text-white">Forecast de receita</p>
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value) as Horizon)}
          className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
        >
          <option value={3}>3 meses</option>
          <option value={6}>6 meses</option>
          <option value={12}>12 meses</option>
        </select>
      </div>

      {loading ? (
        <Skeleton className="mt-4 h-48 w-full" />
      ) : !data || chartData.length === 0 ? (
        <p className="py-10 text-center text-sm text-stone">Dados insuficientes para projetar.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200} className="mt-4">
            <BarChart data={chartData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
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
              <Bar dataKey="Histórico" fill="#00b8a2" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Projeção" fill="#00b8a2" fillOpacity={0.35} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center justify-between text-xs text-stone">
            <span>Média mensal: {fmt(data.monthly_average)}</span>
            <span>Recorrente/mês: {fmt(data.recurring_monthly)}</span>
          </div>
        </>
      )}
    </div>
  );
}
