"use client";

import { useEffect, useRef, useState } from "react";
import {
  Users,
  UserPlus,
  Wallet,
  TrendingUp,
  CalendarDays,
  AlertCircle,
  Clock,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Person {
  id: string;
  full_name: string;
  classification: "visitor" | "member" | "attendee";
  created_at: string;
}

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: string;
  occurred_at: string;
}

interface Celebration {
  id: string;
  name: string;
  type: string;
  day_of_week: number;
  start_time: string;
  recurrence: string;
  is_active: boolean;
}

interface VolunteerSchedule {
  id: string;
  title: string;
  scheduled_date: string;
  deadline_confirm_at: string | null;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLASSIFICATION_LABELS: Record<string, string> = {
  member: "Membros",
  attendee: "Frequentadores",
  visitor: "Visitantes",
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  member: "#1E3A7B",
  attendee: "#00B8A2",
  visitor: "#5C5A56",
};

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function weekBounds(weeksAgo = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) - weeksAgo * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

function weekLabel(weeksAgo: number): string {
  const { start } = weekBounds(weeksAgo);
  return start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function nextOccurrence(cel: Celebration): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = (cel.day_of_week - today.getDay() + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + (daysUntil === 0 ? 7 : daysUntil));
  const [h, m] = cel.start_time.split(":").map(Number);
  next.setHours(h, m, 0, 0);
  return next;
}

function formatWeekday(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [persons, setPersons] = useState<{ data: Person[]; total: number } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [schedules, setSchedules] = useState<VolunteerSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasFetched = useRef(false);
  useEffect(() => {
    // Guard against React StrictMode's double-invoke in development.
    // In production, effects only run once per mount — this ref has no effect there.
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);

    Promise.all([
      api.get<{ data: Person[]; total: number }>("/persons?limit=100"),
      api.get<{ data: Transaction[]; total: number }>("/financial/transactions?limit=100"),
      api.get<Celebration[]>("/celebrations"),
      api.get<{ data: VolunteerSchedule[] }>("/volunteers/schedules"),
    ])
      .then(([personsRes, txRes, celRes, schedRes]) => {
        setPersons(personsRes.data);
        setTransactions(txRes.data.data ?? []);
        setCelebrations(Array.isArray(celRes.data) ? celRes.data : []);
        setSchedules(schedRes.data.data ?? []);
      })
      .catch(() => setError("Não foi possível carregar os dados."))
      .finally(() => setIsLoading(false));
  }, []);

  // ── KPI derivations ────────────────────────────────────────────────────────

  const totalMembers = persons?.total ?? 0;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = (persons?.data ?? []).filter(
    (p) => new Date(p.created_at) >= monthStart
  );

  const classificationBreakdown = (persons?.data ?? []).reduce<Record<string, number>>(
    (acc, p) => { acc[p.classification] = (acc[p.classification] ?? 0) + 1; return acc; },
    {}
  );

  const { start: weekStart, end: weekEnd } = weekBounds(0);
  const { start: prevWeekStart, end: prevWeekEnd } = weekBounds(1);

  const weekTx = transactions.filter((t) => {
    const d = new Date(t.occurred_at);
    return d >= weekStart && d <= weekEnd;
  });
  const prevWeekTx = transactions.filter((t) => {
    const d = new Date(t.occurred_at);
    return d >= prevWeekStart && d <= prevWeekEnd;
  });

  const weekIncome = weekTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const weekExpense = weekTx
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const weekNet = weekIncome - weekExpense;

  const prevWeekIncome = prevWeekTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + parseFloat(t.amount), 0);
  const prevWeekNet = prevWeekTx
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + parseFloat(t.amount), 0) -
    prevWeekTx
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + parseFloat(t.amount), 0);

  const incomeDeltaPct =
    prevWeekIncome > 0
      ? ((weekIncome - prevWeekIncome) / prevWeekIncome) * 100
      : null;
  const incomeDeltaStr =
    incomeDeltaPct !== null
      ? `${incomeDeltaPct >= 0 ? "+" : ""}${incomeDeltaPct.toFixed(0)}% vs semana anterior`
      : "Sem dados da semana anterior";
  const incomeDeltaType: "up" | "down" | "neutral" =
    incomeDeltaPct === null ? "neutral" : incomeDeltaPct >= 0 ? "up" : "down";

  const netDeltaType: "up" | "down" | "neutral" =
    weekNet > 0 ? "up" : weekNet < 0 ? "down" : "neutral";

  // ── Chart data ─────────────────────────────────────────────────────────────

  const pieData = Object.entries(classificationBreakdown)
    .map(([key, value]) => ({
      name: CLASSIFICATION_LABELS[key] ?? key,
      value,
      key,
    }))
    .sort((a, b) => b.value - a.value);

  // Last 4 weeks bar chart
  const barData = [3, 2, 1, 0].map((weeksAgo) => {
    const { start, end } = weekBounds(weeksAgo);
    const wTx = transactions.filter((t) => {
      const d = new Date(t.occurred_at);
      return d >= start && d <= end;
    });
    const income = wTx
      .filter((t) => t.type === "income")
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    const expense = wTx
      .filter((t) => t.type === "expense")
      .reduce((s, t) => s + parseFloat(t.amount), 0);
    return { week: weekLabel(weeksAgo), receita: income, resultado: income - expense };
  });

  // ── Next celebration ────────────────────────────────────────────────────────

  const activeCelebrations = celebrations.filter((c) => c.is_active);
  const nextCel =
    activeCelebrations.length > 0
      ? activeCelebrations
          .map((c) => ({ cel: c, date: nextOccurrence(c) }))
          .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
      : null;

  // ── Alerts ──────────────────────────────────────────────────────────────────

  const overdueSchedules = schedules.filter(
    (s) =>
      s.deadline_confirm_at &&
      new Date(s.deadline_confirm_at) < now &&
      s.status === "published"
  );

  const upcomingSchedules = schedules.filter((s) => {
    const d = new Date(s.scheduled_date);
    return d >= weekStart && d <= new Date(weekStart.getTime() + 14 * 24 * 60 * 60 * 1000);
  });

  if (error) {
    return (
      <div className="flex items-center gap-2 text-crimson text-sm">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Row 1: KPI cards ─────────────────────────────────────────────────── */}
      <div>
        <SectionHeader title="Visão geral" />
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total membros */}
          <KpiCard
            title="Total de membros"
            value={totalMembers.toString()}
            delta={
              newThisMonth.length > 0
                ? `+${newThisMonth.length} este mês`
                : "Sem novos este mês"
            }
            deltaType={newThisMonth.length > 0 ? "up" : "neutral"}
            icon={Users}
            isLoading={isLoading}
          />

          {/* Novos este mês */}
          <KpiCard
            title="Novos este mês"
            value={newThisMonth.length.toString()}
            icon={UserPlus}
            isLoading={isLoading}
          >
            {!isLoading && newThisMonth.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(
                  newThisMonth.reduce<Record<string, number>>((acc, p) => {
                    acc[p.classification] = (acc[p.classification] ?? 0) + 1;
                    return acc;
                  }, {})
                ).map(([cls, count]) => (
                  <span
                    key={cls}
                    className="rounded-[100px] bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium text-stone"
                  >
                    {count} {CLASSIFICATION_LABELS[cls] ?? cls}
                  </span>
                ))}
              </div>
            )}
          </KpiCard>

          {/* Receitas da semana */}
          <KpiCard
            title="Receitas da semana"
            value={formatBRL(weekIncome)}
            suffix="R$"
            mono
            delta={incomeDeltaStr}
            deltaType={incomeDeltaType}
            icon={Wallet}
            isLoading={isLoading}
          />

          {/* Resultado líquido */}
          <KpiCard
            title="Resultado líquido"
            value={formatBRL(Math.abs(weekNet))}
            suffix={weekNet >= 0 ? "R$" : "−R$"}
            mono
            delta={
              prevWeekNet !== 0
                ? `${weekNet >= 0 ? "+" : ""}${formatBRL(weekNet - prevWeekNet)} vs sem. anterior`
                : undefined
            }
            deltaType={netDeltaType}
            icon={TrendingUp}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* ── Row 2: Charts ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Pie: classificação de membros */}
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-sm)]">
          <SectionHeader
            title="Membros por classificação"
            action={{ href: "/pessoas", label: "Ver todos" }}
          />
          {isLoading ? (
            <div className="mt-4 flex items-center justify-center">
              <Skeleton className="h-[240px] w-[240px] rounded-full" />
            </div>
          ) : pieData.length === 0 ? (
            <p className="mt-8 text-center text-sm text-stone">Sem dados</p>
          ) : (
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={CLASSIFICATION_COLORS[entry.key] ?? "#9B9893"}
                        stroke="transparent"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [value, ""]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border-default)",
                      background: "var(--surface-base)",
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: 12, color: "var(--color-stone)" }}>
                        {value}
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Bar: receita e resultado últimas 4 semanas */}
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-sm)]">
          <SectionHeader
            title="Financeiro — últimas 4 semanas"
            action={{ href: "/financeiro", label: "Ver tudo" }}
          />
          {isLoading ? (
            <div className="mt-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={barData} barSize={20} barGap={4}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--border-default)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11, fill: "#5C5A56" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#5C5A56" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                    width={36}
                  />
                  <Tooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any, name: any) => [
                      `R$ ${formatBRL(Number(value))}`,
                      name === "receita" ? "Receita" : "Resultado",
                    ]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid var(--border-default)",
                      background: "var(--surface-base)",
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    iconType="square"
                    iconSize={8}
                    formatter={(value) => (
                      <span style={{ fontSize: 12, color: "var(--color-stone)" }}>
                        {value === "receita" ? "Receita" : "Resultado líquido"}
                      </span>
                    )}
                  />
                  <Bar dataKey="receita" fill="#1E3A7B" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resultado" fill="#00B8A2" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: Next celebration + Alerts ─────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Próxima celebração */}
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-sm)]">
          <SectionHeader
            title="Próxima celebração"
            action={{ href: "/celebracoes", label: "Ver agenda" }}
          />
          {isLoading ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          ) : nextCel ? (
            <div className="mt-4">
              <p className="font-medium text-ink dark:text-white">{nextCel.cel.name}</p>
              <div className="mt-2 flex items-center gap-1.5 text-sm text-stone">
                <CalendarDays size={14} strokeWidth={1.5} />
                <span className="capitalize">{formatWeekday(nextCel.date)}</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-stone">
                <Clock size={14} strokeWidth={1.5} />
                <span>{nextCel.cel.start_time}</span>
              </div>
              <div className="mt-3">
                <span className="rounded-[100px] bg-navy-dim px-2.5 py-1 text-xs font-medium text-navy">
                  {upcomingSchedules.length > 0
                    ? `${upcomingSchedules.length} escala${upcomingSchedules.length > 1 ? "s" : ""} publicada${upcomingSchedules.length > 1 ? "s" : ""}`
                    : "Sem escalas publicadas"}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone">Nenhuma celebração cadastrada.</p>
          )}
        </div>

        {/* Alertas rápidos */}
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-sm)]">
          <SectionHeader title="Alertas" />
          {isLoading ? (
            <div className="mt-4 space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-[8px]" />
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {overdueSchedules.length > 0 ? (
                <div className="flex items-start gap-2.5 rounded-[8px] bg-crimson-dim p-3">
                  <AlertCircle size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
                  <p className="text-sm text-crimson">
                    <span className="font-medium">{overdueSchedules.length} escala</span>
                    {overdueSchedules.length > 1 ? "s" : ""} com prazo de confirmação vencido
                  </p>
                </div>
              ) : null}

              {totalMembers > 0 && newThisMonth.length === 0 ? (
                <div className="flex items-start gap-2.5 rounded-[8px] bg-[var(--surface-subtle)] p-3">
                  <AlertCircle size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-stone" />
                  <p className="text-sm text-stone">Nenhum novo membro este mês.</p>
                </div>
              ) : null}

              {overdueSchedules.length === 0 &&
                !(totalMembers > 0 && newThisMonth.length === 0) && (
                  <div className="flex items-center gap-2 text-sm text-teal">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-dim text-teal">
                      ✓
                    </span>
                    Sem alertas no momento.
                  </div>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
