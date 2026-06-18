"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Plus, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Repeat, Loader2, Pencil, Trash2, Eye, Settings2 } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NewTransactionModal } from "@/components/financial/NewTransactionModal";
import { RecurrenceScopeDialog, type RecurrenceScope } from "@/components/financial/RecurrenceScopeDialog";
import { ExportButton } from "@/components/financial/ExportButton";
import { CategoriesModal } from "@/components/financial/CategoriesModal";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: string | number;
  occurred_at: string;
  description: string;
  category_id: string | null;
  category?: { id: string; name: string; type: string } | null;
  recurring_rule_id?: string | null;
  status: "pending" | "paid" | "confirmed";
}

interface Category {
  id: string;
  name: string;
  type: "income" | "expense";
  children: Category[];
}

interface RecurringRule {
  id: string;
  mode: "installment" | "fixed";
  frequency: "weekly" | "monthly" | "yearly";
  interval: number;
  installments: number | null;
  next_occurrence_at: string;
  ends_at: string | null;
  is_active: boolean;
  transactions_count: number;
}

interface DreCategory {
  category_name: string;
  total: number;
  count: number;
}

interface DRE {
  period: { start: string; end: string };
  revenue: { categories: DreCategory[]; total: number };
  expenses: { categories: DreCategory[]; total: number };
  net_result: number;
  previous_period: {
    period: { start: string; end: string };
    revenue_total: number;
    expenses_total: number;
    net_result: number;
  };
}

function frequencyLabel(freq: "weekly" | "monthly" | "yearly"): string {
  return freq === "weekly" ? "Semanal" : freq === "monthly" ? "Mensal" : "Anual";
}

function statusLabel(status: Transaction["status"]): string {
  return status === "pending" ? "Não pago" : status === "paid" ? "Pago" : "Exportado";
}

function statusBadgeClass(status: Transaction["status"]): string {
  if (status === "pending") return "bg-[var(--surface-subtle)] text-stone";
  if (status === "paid") return "bg-teal-dim text-teal";
  return "bg-blue-100 text-blue-700";
}

type TabValue = "overview" | "transactions" | "recurring" | "dre";
const TX_PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

function firstOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function buildWeeklyChart(txs: Transaction[]): { week: string; Entradas: number; Saídas: number }[] {
  const map = new Map<number, { i: number; e: number }>();
  for (const tx of txs) {
    const week = Math.ceil(new Date(tx.occurred_at).getDate() / 7);
    const entry = map.get(week) ?? { i: 0, e: 0 };
    if (tx.type === "income") entry.i += Number(tx.amount);
    else entry.e += Number(tx.amount);
    map.set(week, entry);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([w, d]) => ({ week: `Sem ${w}`, Entradas: d.i, Saídas: d.e }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  loading,
  variant = "default",
}: {
  label: string;
  value: number;
  loading: boolean;
  variant?: "default" | "positive" | "negative";
}) {
  const color =
    variant === "positive" ? "text-teal" : variant === "negative" ? "text-crimson" : "text-ink dark:text-white";
  return (
    <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-stone">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-28" />
      ) : (
        <p className={cn("mt-1 text-2xl font-medium tabular-nums", color)}>{fmt(value)}</p>
      )}
    </div>
  );
}

function DeltaCell({ current, previous }: { current: number; previous: number }) {
  const delta = deltaPercent(current, previous);
  if (delta === null)
    return <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>;
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceiroPage() {
  const { user } = useAuth();
  const router = useRouter();

  const isSecretary = user?.roles?.includes("secretary") ?? false;
  const isPastor = user?.roles?.includes("pastor") ?? false;
  const canDeleteTx =
    user?.roles?.includes("admin_congregation") || user?.roles?.includes("tenant_admin") || false;
  const canManageCategories =
    user?.roles?.includes("treasurer") ||
    user?.roles?.includes("admin_congregation") ||
    user?.roles?.includes("tenant_admin") ||
    false;

  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  // Transactions + categories (shared across tabs)
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);
  const hasFetchedTx = useRef(false);
  const txSeq = useRef(0);

  // DRE state
  const [dreStart, setDreStart] = useState(firstOfMonthIso);
  const [dreEnd, setDreEnd] = useState(todayIso);
  const [dre, setDre] = useState<DRE | null>(null);
  const [loadingDre, setLoadingDre] = useState(false);
  const prevDreKey = useRef("");

  // Lançamentos filters (client-side)
  const [txType, setTxType] = useState<"" | "income" | "expense">("");
  const [txCatId, setTxCatId] = useState("");
  const [txFrom, setTxFrom] = useState("");
  const [txTo, setTxTo] = useState("");
  const [txStatus, setTxStatus] = useState<"" | "pending" | "paid" | "confirmed">("");
  const [txPage, setTxPage] = useState(1);
  const [statusUpdatingIds, setStatusUpdatingIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editScope, setEditScope] = useState<RecurrenceScope | undefined>(undefined);
  const [viewingTx, setViewingTx] = useState<Transaction | null>(null);
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);
  const [scopeDialog, setScopeDialog] = useState<{ mode: "edit" | "delete"; tx: Transaction } | null>(null);
  const [scopeSubmitting, setScopeSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Recurring rules
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([]);
  const [loadingRecurring, setLoadingRecurring] = useState(false);
  const hasFetchedRecurring = useRef(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  // ── Secretary redirect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (user && isSecretary) router.replace("/dashboard");
  }, [user, isSecretary, router]);

  // ── Fetch transactions + categories ─────────────────────────────────────────
  const loadTx = useCallback(() => {
    if (hasFetchedTx.current) return;
    hasFetchedTx.current = true;
    const seq = ++txSeq.current;
    setLoadingTx(true);
    Promise.all([
      api.get<{ data: Transaction[]; total: number }>("/financial/transactions?limit=100"),
      api.get<Category[]>("/financial/categories"),
    ])
      .then(([txRes, catRes]) => {
        if (seq !== txSeq.current) return;
        setTransactions(txRes.data.data ?? []);
        setCategories(catRes.data ?? []);
      })
      .catch(() => {})
      .finally(() => { if (seq === txSeq.current) setLoadingTx(false); });
  }, []);

  useEffect(() => { loadTx(); }, [loadTx]);

  function refreshTx() {
    hasFetchedTx.current = false;
    loadTx();
  }

  // ── Fetch recurring rules ────────────────────────────────────────────────────
  const loadRecurring = useCallback(() => {
    if (hasFetchedRecurring.current) return;
    hasFetchedRecurring.current = true;
    setLoadingRecurring(true);
    api
      .get<RecurringRule[]>("/financial/recurring-rules")
      .then((r) => setRecurringRules(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoadingRecurring(false));
  }, []);

  useEffect(() => {
    if (activeTab === "recurring") loadRecurring();
  }, [activeTab, loadRecurring]);

  function refreshRecurring() {
    hasFetchedRecurring.current = false;
    loadRecurring();
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  async function handleDeleteTx(id: string, scope?: RecurrenceScope) {
    setDeletingTxId(id);
    if (scope) setScopeSubmitting(true);
    try {
      const qs = scope ? `?scope=${scope}` : "";
      await api.delete(`/financial/transactions/${id}${qs}`);
      setConfirmDeleteTxId(null);
      setScopeDialog(null);
      showToast(
        scope === "this_and_future"
          ? "Lançamento e próximos removidos com sucesso"
          : "Lançamento removido com sucesso"
      );
      refreshTx();
      if (scope) refreshRecurring();
    } catch {
      showToast("Erro ao remover lançamento.");
    } finally {
      setDeletingTxId(null);
      setScopeSubmitting(false);
    }
  }

  async function handleToggleStatus(tx: Transaction) {
    if (tx.status === "confirmed" || statusUpdatingIds.has(tx.id)) return;
    const previousStatus = tx.status;
    const nextStatus: "pending" | "paid" = previousStatus === "pending" ? "paid" : "pending";

    setStatusUpdatingIds((prev) => new Set(prev).add(tx.id));
    setTransactions((prev) =>
      prev.map((t) => (t.id === tx.id ? { ...t, status: nextStatus } : t))
    );

    try {
      await api.patch(`/financial/transactions/${tx.id}/status`, { status: nextStatus });
    } catch {
      setTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, status: previousStatus } : t))
      );
      showToast("Erro ao atualizar status do lançamento.");
    } finally {
      setStatusUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(tx.id);
        return next;
      });
    }
  }

  function handleScopeConfirm(scope: RecurrenceScope) {
    if (!scopeDialog) return;
    if (scopeDialog.mode === "edit") {
      setEditScope(scope);
      setEditingTx(scopeDialog.tx);
      setScopeDialog(null);
    } else {
      handleDeleteTx(scopeDialog.tx.id, scope);
    }
  }

  async function handleDeactivate(id: string) {
    setDeactivatingId(id);
    try {
      await api.patch(`/financial/recurring-rules/${id}/deactivate`);
      setConfirmDeactivateId(null);
      refreshRecurring();
    } catch {
      // ignore
    } finally {
      setDeactivatingId(null);
    }
  }

  // ── Fetch DRE ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "dre" && activeTab !== "overview") return;
    // For overview use current month; for dre tab use user-selected period
    const start = activeTab === "overview" ? firstOfMonthIso() : dreStart;
    const end = activeTab === "overview" ? todayIso() : dreEnd;
    const key = `${start}|${end}`;
    if (prevDreKey.current === key) return;
    prevDreKey.current = key;
    setLoadingDre(true);
    api
      .get<DRE>(`/financial/dre?period_start=${start}&period_end=${end}`)
      .then((r) => setDre(r.data))
      .catch(() => {})
      .finally(() => setLoadingDre(false));
  }, [activeTab, dreStart, dreEnd]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const kpiIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const kpiExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const kpiResult = kpiIncome - kpiExpense;
  const chartData = buildWeeklyChart(transactions);

  const forecastPct = dre
    ? dre.previous_period.revenue_total > 0
      ? Math.min(100, Math.round((dre.revenue.total / dre.previous_period.revenue_total) * 100))
      : 100
    : null;

  const filteredTx = transactions.filter((t) => {
    if (txType && t.type !== txType) return false;
    if (txCatId && t.category_id !== txCatId) return false;
    if (txFrom && t.occurred_at.slice(0, 10) < txFrom) return false;
    if (txTo && t.occurred_at.slice(0, 10) > txTo) return false;
    if (txStatus && t.status !== txStatus) return false;
    return true;
  });
  const txTotalPages = Math.max(1, Math.ceil(filteredTx.length / TX_PAGE_SIZE));
  const txPageData = filteredTx.slice((txPage - 1) * TX_PAGE_SIZE, txPage * TX_PAGE_SIZE);

  // ── Table columns ─────────────────────────────────────────────────────────────
  const txCols: Column<Transaction>[] = [
    {
      key: "date",
      header: "Data",
      width: "110px",
      render: (r) => <span className="text-stone">{fmtDate(r.occurred_at)}</span>,
    },
    {
      key: "desc",
      header: "Descrição",
      render: (r) => {
        const isInstallment = r.recurring_rule_id && /\(\d+\/\d+\)$/.test(r.description);
        const isFixed = r.recurring_rule_id && !isInstallment;
        return (
          <span className="inline-flex items-center gap-1.5 font-medium text-ink dark:text-white">
            {r.description}
            {isInstallment && (
              <span
                title="Lançamento parcelado"
                className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              >
                <Repeat size={10} strokeWidth={2} />
                Parcelado
              </span>
            )}
            {isFixed && (
              <span
                title="Lançamento fixo mensal"
                className="inline-flex items-center gap-0.5 rounded-full bg-teal-dim px-1.5 py-0.5 text-[10px] font-medium text-teal"
              >
                <Repeat size={10} strokeWidth={2} />
                Fixo
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "cat",
      header: "Categoria",
      width: "140px",
      render: (r) => <span className="text-stone">{r.category?.name ?? "—"}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      width: "100px",
      render: (r) => (
        <span className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
          r.type === "income" ? "bg-teal-dim text-teal" : "bg-crimson-dim text-crimson"
        )}>
          {r.type === "income" ? "Entrada" : "Saída"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Valor",
      width: "130px",
      render: (r) => (
        <span className={cn("font-medium tabular-nums", r.type === "income" ? "text-teal" : "text-crimson")}>
          {r.type === "expense" ? "−" : "+"}
          {fmt(Number(r.amount))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "140px",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {r.status !== "confirmed" && (
            <input
              type="checkbox"
              checked={r.status === "paid"}
              onChange={() => handleToggleStatus(r)}
              disabled={statusUpdatingIds.has(r.id)}
              aria-label={r.status === "pending" ? "Marcar como pago" : "Desfazer pagamento"}
              title={r.status === "pending" ? "Marcar como pago" : "Desfazer pagamento"}
              className="h-3.5 w-3.5 cursor-pointer accent-teal disabled:cursor-not-allowed disabled:opacity-50"
            />
          )}
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusBadgeClass(r.status))}>
            {statusLabel(r.status)}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      width: "90px",
      render: (r) => {
        if (r.status === "confirmed") {
          return (
            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-[8px]"
                aria-label="Visualizar lançamento"
                onClick={() => setViewingTx(r)}
              >
                <Eye size={13} strokeWidth={1.5} />
              </Button>
            </div>
          );
        }
        const isRecurring = !!r.recurring_rule_id;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px]"
              aria-label="Editar lançamento"
              onClick={() => (isRecurring ? setScopeDialog({ mode: "edit", tx: r }) : setEditingTx(r))}
            >
              <Pencil size={13} strokeWidth={1.5} />
            </Button>
            {canDeleteTx && (
              <Button
                variant="outline"
                size="icon-sm"
                className="rounded-[8px] text-crimson hover:bg-crimson-dim"
                aria-label="Remover lançamento"
                onClick={() => (isRecurring ? setScopeDialog({ mode: "delete", tx: r }) : setConfirmDeleteTxId(r.id))}
              >
                <Trash2 size={13} strokeWidth={1.5} />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  // ── Tab button style ─────────────────────────────────────────────────────────
  const tabBtn = (active: boolean) =>
    cn(
      "relative px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none",
      active
        ? "text-navy dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-navy"
        : "text-stone hover:text-ink dark:hover:text-white"
    );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink dark:text-white">Financeiro</h1>
          <p className="mt-0.5 text-sm text-stone">Visão geral e tesouraria</p>
        </div>
        {canManageCategories && (
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-[8px]"
            aria-label="Categorias"
            title="Categorias"
            onClick={() => setCategoriesOpen(true)}
          >
            <Settings2 size={15} strokeWidth={1.5} />
          </Button>
        )}
      </div>

      <Tabs.Root
        value={activeTab}
        onValueChange={(val) => { setActiveTab(val as TabValue); setTxPage(1); }}
      >
        <Tabs.List className="flex border-b border-[var(--border-default)]">
          <Tabs.Tab value="overview" className={tabBtn(activeTab === "overview")}>
            Visão Geral
          </Tabs.Tab>
          {!isPastor && (
            <Tabs.Tab value="transactions" className={tabBtn(activeTab === "transactions")}>
              Lançamentos
            </Tabs.Tab>
          )}
          {!isPastor && (
            <Tabs.Tab value="recurring" className={tabBtn(activeTab === "recurring")}>
              Recorrentes
            </Tabs.Tab>
          )}
          <Tabs.Tab value="dre" className={tabBtn(activeTab === "dre")}>
            DRE
          </Tabs.Tab>
        </Tabs.List>

        {/* ── Visão Geral ────────────────────────────────────────────────────── */}
        <Tabs.Panel value="overview" className="pt-5">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <KpiCard label="Receitas" value={kpiIncome} loading={loadingTx} variant="positive" />
              <KpiCard label="Despesas" value={kpiExpense} loading={loadingTx} variant="negative" />
              <KpiCard label="Resultado" value={kpiResult} loading={loadingTx} variant={kpiResult >= 0 ? "positive" : "negative"} />
            </div>

            <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
              <p className="mb-4 text-sm font-medium text-ink dark:text-white">Lançamentos por semana</p>
              {loadingTx ? (
                <Skeleton className="h-48 w-full" />
              ) : chartData.length === 0 ? (
                <p className="py-10 text-center text-sm text-stone">Sem lançamentos no período.</p>
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

            <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
              <p className="text-sm font-medium text-ink dark:text-white">Receitas vs período anterior</p>
              {loadingDre || forecastPct === null ? (
                <Skeleton className="mt-3 h-2.5 w-full rounded-full" />
              ) : (
                <>
                  <p className="mt-1 text-xs text-stone">
                    {dre && dre.previous_period.revenue_total > 0
                      ? `${forecastPct}% do período anterior (${fmt(dre.previous_period.revenue_total)})`
                      : "Sem dados do período anterior para comparar"}
                  </p>
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                    <div
                      className="h-full rounded-full bg-teal transition-all duration-500"
                      style={{ width: `${forecastPct}%` }}
                    />
                  </div>
                  {dre && (
                    <div className="mt-2 flex items-center justify-between text-xs text-stone">
                      <span>{fmt(dre.revenue.total)} este mês</span>
                      <span className={forecastPct >= 100 ? "text-teal font-medium" : ""}>
                        {forecastPct >= 100 ? "✓ Superou o período anterior" : `faltam ${100 - forecastPct}% para igualar`}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Tabs.Panel>

        {/* ── Lançamentos ────────────────────────────────────────────────────── */}
        {!isPastor && (
          <Tabs.Panel value="transactions" className="pt-5">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={txType}
                    onChange={(e) => { setTxType(e.target.value as typeof txType); setTxCatId(""); setTxPage(1); }}
                    className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                  >
                    <option value="">Todos os tipos</option>
                    <option value="income">Entradas</option>
                    <option value="expense">Saídas</option>
                  </select>

                  <select
                    value={txCatId}
                    onChange={(e) => { setTxCatId(e.target.value); setTxPage(1); }}
                    className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                  >
                    <option value="">Todas as categorias</option>
                    {categories
                      .filter((c) => !txType || c.type === txType)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>

                  <input
                    type="date"
                    value={txFrom}
                    onChange={(e) => { setTxFrom(e.target.value); setTxPage(1); }}
                    className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                  />
                  <span className="text-xs text-stone">até</span>
                  <input
                    type="date"
                    value={txTo}
                    onChange={(e) => { setTxTo(e.target.value); setTxPage(1); }}
                    className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                  />

                  <select
                    value={txStatus}
                    onChange={(e) => { setTxStatus(e.target.value as typeof txStatus); setTxPage(1); }}
                    className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                  >
                    <option value="">Todos os status</option>
                    <option value="pending">Não pago</option>
                    <option value="paid">Pago</option>
                    <option value="confirmed">Exportado</option>
                  </select>
                </div>

                <Button
                  size="sm"
                  className="gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus size={14} strokeWidth={1.5} />
                  Novo lançamento
                </Button>
              </div>

              <DataTable
                columns={txCols}
                rows={txPageData}
                getRowKey={(t) => t.id}
                isLoading={loadingTx}
                emptyState={
                  txType || txCatId || txFrom || txTo || txStatus
                    ? "Nenhum lançamento com esses filtros."
                    : "Nenhum lançamento registrado."
                }
              />

              {!loadingTx && filteredTx.length > TX_PAGE_SIZE && (
                <div className="flex items-center justify-between text-sm text-stone">
                  <span>
                    {(txPage - 1) * TX_PAGE_SIZE + 1}–{Math.min(txPage * TX_PAGE_SIZE, filteredTx.length)} de {filteredTx.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon-sm" className="rounded-[8px]"
                      aria-label="Página anterior"
                      onClick={() => setTxPage((p) => Math.max(1, p - 1))} disabled={txPage === 1}>
                      <ChevronLeft size={14} />
                    </Button>
                    <span className="px-2 text-xs">{txPage} / {txTotalPages}</span>
                    <Button variant="outline" size="icon-sm" className="rounded-[8px]"
                      aria-label="Próxima página"
                      onClick={() => setTxPage((p) => Math.min(txTotalPages, p + 1))} disabled={txPage === txTotalPages}>
                      <ChevronRight size={14} />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Tabs.Panel>
        )}

        {/* ── Recorrentes ────────────────────────────────────────────────────── */}
        {!isPastor && (
          <Tabs.Panel value="recurring" className="pt-5">
            {loadingRecurring ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : recurringRules.length === 0 ? (
              <p className="py-10 text-center text-sm text-stone">
                Nenhuma regra recorrente ativa.
              </p>
            ) : (
              <div className="overflow-hidden rounded-[12px] border border-[var(--border-default)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] bg-[var(--surface-subtle)]">
                      <th className="py-2.5 pl-4 text-left text-xs font-medium uppercase tracking-wide text-stone">Descrição</th>
                      <th className="py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-stone">Tipo</th>
                      <th className="py-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-stone">Valor</th>
                      <th className="py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-stone">Frequência</th>
                      <th className="py-2.5 pr-4 text-left text-xs font-medium uppercase tracking-wide text-stone">Próxima ocorrência</th>
                      <th className="py-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-stone">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recurringRules.map((rule) => {
                      const tx = transactions.find((t) => t.recurring_rule_id === rule.id);
                      const cleanDescription = tx?.description.replace(/\s*\(\d+\/\d+\)$/, "") ?? "—";
                      return (
                        <tr key={rule.id} className="border-t border-[var(--border-default)] hover:bg-[var(--surface-subtle)] transition-colors">
                          <td className="py-2.5 pl-4 text-sm text-ink dark:text-white">{cleanDescription}</td>
                          <td className="py-2.5 pr-4">
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              rule.mode === "installment" ? "bg-amber-100 text-amber-700" : "bg-teal-dim text-teal"
                            )}>
                              {rule.mode === "installment"
                                ? `Parcelado ${rule.transactions_count}/${rule.installments} geradas`
                                : "Fixo mensal"}
                            </span>
                          </td>
                          <td className={cn(
                            "py-2.5 pr-4 text-right text-sm font-medium tabular-nums",
                            tx?.type === "income" ? "text-teal" : "text-crimson"
                          )}>
                            {tx ? (
                              <>
                                {tx.type === "expense" ? "−" : "+"}
                                {fmt(Number(tx.amount))}
                              </>
                            ) : "—"}
                          </td>
                          <td className="py-2.5 pr-4 text-sm text-stone">{frequencyLabel(rule.frequency)}</td>
                          <td className="py-2.5 pr-4 text-sm text-stone">{fmtDate(rule.next_occurrence_at)}</td>
                          <td className="py-2.5 pr-4 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-[8px]"
                              onClick={() => setConfirmDeactivateId(rule.id)}
                            >
                              Desativar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {confirmDeactivateId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                <div className="w-full max-w-sm rounded-[12px] bg-[var(--surface-card)] p-5">
                  <p className="text-sm font-medium text-ink dark:text-white">
                    Desativar regra recorrente?
                  </p>
                  <p className="mt-1.5 text-sm text-stone">
                    Nenhum novo lançamento será gerado a partir desta regra.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-[8px]"
                      onClick={() => setConfirmDeactivateId(null)}
                      disabled={deactivatingId === confirmDeactivateId}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 rounded-[8px] bg-crimson text-white hover:opacity-90"
                      onClick={() => handleDeactivate(confirmDeactivateId)}
                      disabled={deactivatingId === confirmDeactivateId}
                    >
                      {deactivatingId === confirmDeactivateId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        "Desativar"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Tabs.Panel>
        )}

        {/* ── DRE ────────────────────────────────────────────────────────────── */}
        <Tabs.Panel value="dre" className="pt-5">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dreStart}
                  onChange={(e) => { setDreStart(e.target.value); prevDreKey.current = ""; }}
                  className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                />
                <span className="text-xs text-stone">até</span>
                <input
                  type="date"
                  value={dreEnd}
                  onChange={(e) => { setDreEnd(e.target.value); prevDreKey.current = ""; }}
                  className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                />
              </div>
              {!isPastor && <ExportButton periodStart={dreStart} periodEnd={dreEnd} />}
            </div>

            {loadingDre ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !dre ? (
              <p className="py-10 text-center text-sm text-stone">
                Selecione um período para ver o DRE.
              </p>
            ) : (
              <div className="overflow-hidden rounded-[12px] border border-[var(--border-default)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] bg-[var(--surface-subtle)]">
                      <th className="py-2.5 pl-4 text-left text-xs font-medium uppercase tracking-wide text-stone">
                        Conta
                      </th>
                      {!isPastor && (
                        <th className="py-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-stone">
                          Total
                        </th>
                      )}
                      <th className="py-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-stone">
                        Qtd
                      </th>
                      <th className="py-2.5 pr-4 text-right text-xs font-medium uppercase tracking-wide text-stone">
                        Δ período ant.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* RECEITAS group */}
                    <tr className="border-t border-[var(--border-default)] bg-[var(--surface-subtle)]">
                      <td className="py-2.5 pl-4 text-xs font-semibold uppercase tracking-wider text-stone">RECEITAS</td>
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
                        <tr key={cat.category_name} className="border-t border-[var(--border-default)] hover:bg-[var(--surface-subtle)] transition-colors">
                          <td className="py-2.5 pl-8 text-sm text-ink dark:text-white">{cat.category_name}</td>
                          {!isPastor && (
                            <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-ink dark:text-white">
                              {fmt(cat.total)}
                            </td>
                          )}
                          <td className="py-2.5 pr-4 text-right text-xs text-stone">{cat.count}</td>
                          <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>
                        </tr>
                      ))
                    )}

                    {/* DESPESAS group */}
                    <tr className="border-t border-[var(--border-default)] bg-[var(--surface-subtle)]">
                      <td className="py-2.5 pl-4 text-xs font-semibold uppercase tracking-wider text-stone">DESPESAS</td>
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
                        <tr key={cat.category_name} className="border-t border-[var(--border-default)] hover:bg-[var(--surface-subtle)] transition-colors">
                          <td className="py-2.5 pl-8 text-sm text-ink dark:text-white">{cat.category_name}</td>
                          {!isPastor && (
                            <td className="py-2.5 pr-4 text-right text-sm tabular-nums text-ink dark:text-white">
                              {fmt(cat.total)}
                            </td>
                          )}
                          <td className="py-2.5 pr-4 text-right text-xs text-stone">{cat.count}</td>
                          <td className="py-2.5 pr-4 text-right text-xs text-stone">—</td>
                        </tr>
                      ))
                    )}

                    {/* Resultado líquido */}
                    <tr className="border-t-2 border-[var(--border-default)] bg-[var(--surface-subtle)]">
                      <td className="py-3 pl-4 text-sm font-semibold text-ink dark:text-white">RESULTADO LÍQUIDO</td>
                      {!isPastor && (
                        <td className={cn("py-3 pr-4 text-right text-sm font-semibold tabular-nums", dre.net_result >= 0 ? "text-teal" : "text-crimson")}>
                          {fmt(dre.net_result)}
                        </td>
                      )}
                      <td className="py-3 pr-4 text-right text-xs text-stone">—</td>
                      <DeltaCell current={dre.net_result} previous={dre.previous_period.net_result} />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Tabs.Panel>
      </Tabs.Root>

      <NewTransactionModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { refreshTx(); refreshRecurring(); }}
      />

      <NewTransactionModal
        open={!!editingTx}
        onOpenChange={(v) => { if (!v) { setEditingTx(null); setEditScope(undefined); } }}
        onCreated={() => { refreshTx(); refreshRecurring(); }}
        editTransaction={editingTx}
        scope={editScope}
      />

      <NewTransactionModal
        open={!!viewingTx}
        onOpenChange={(v) => { if (!v) setViewingTx(null); }}
        onCreated={() => {}}
        editTransaction={viewingTx}
        viewOnly
      />

      {canManageCategories && (
        <CategoriesModal
          open={categoriesOpen}
          onOpenChange={setCategoriesOpen}
          onChanged={refreshTx}
        />
      )}

      <RecurrenceScopeDialog
        open={!!scopeDialog}
        mode={scopeDialog?.mode ?? "edit"}
        isSubmitting={scopeSubmitting}
        onCancel={() => setScopeDialog(null)}
        onConfirm={handleScopeConfirm}
      />

      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-white dark:text-ink">
          {toastMsg}
        </div>
      )}

      {confirmDeleteTxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[12px] bg-[var(--surface-card)] p-5">
            <p className="text-sm font-medium text-ink dark:text-white">
              Remover lançamento?
            </p>
            <p className="mt-1.5 text-sm text-stone">
              Esta ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 rounded-[8px]"
                onClick={() => setConfirmDeleteTxId(null)}
                disabled={deletingTxId === confirmDeleteTxId}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 rounded-[8px] bg-crimson text-white hover:opacity-90"
                onClick={() => handleDeleteTx(confirmDeleteTxId)}
                disabled={deletingTxId === confirmDeleteTxId}
              >
                {deletingTxId === confirmDeleteTxId ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Remover"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
