"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Repeat, Loader2, Pencil, Trash2, Eye, Settings2, Layers } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { NewTransactionModal } from "@/components/financial/NewTransactionModal";
import { RecurrenceScopeDialog, type RecurrenceScope } from "@/components/financial/RecurrenceScopeDialog";
import { ExportButton } from "@/components/financial/ExportButton";
import { CategoriesModal } from "@/components/financial/CategoriesModal";
import { CostCentersModal } from "@/components/financial/CostCentersModal";
import { CashBalanceCard } from "@/components/financial/CashBalanceCard";
import { WeeklyDashboardCard } from "@/components/financial/WeeklyDashboardCard";
import { PeriodNavigator } from "@/components/financial/PeriodNavigator";
import { ForecastCard } from "@/components/financial/ForecastCard";
import { BankReconciliationPanel } from "@/components/financial/BankReconciliationPanel";
import { DonationBookletPanel } from "@/components/financial/DonationBookletPanel";
import { BalancetePanel } from "@/components/financial/BalancetePanel";
import { DynamicPixPanel } from "@/components/financial/DynamicPixPanel";
import { PublicIntentsPanel } from "@/components/financial/PublicIntentsPanel";
import { PixSubscriptionsPanel } from "@/components/financial/PixSubscriptionsPanel";
import { DonationReceiptsPanel } from "@/components/financial/DonationReceiptsPanel";
import { useAuth } from "@/hooks/useAuth";
import api, { isForbidden } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatInstant } from "@/lib/datetime";
import { monthRangeOf, periodFor, todayKey, type Period } from "@/lib/period";
import { TX_FETCH_LIMIT, TX_MAX_PAGES, dayRangeBounds, fetchTransactionsInRange } from "@/lib/transactions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: string | number;
  occurred_at: string;
  description: string;
  category_id: string | null;
  category?: { id: string; name: string; type: string } | null;
  cost_center_id?: string | null;
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

/** Dia civil "AAAA-MM-DD", o formato do `<input type="date">`. */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function statusLabel(status: Transaction["status"]): string {
  return status === "pending" ? "Não pago" : status === "paid" ? "Pago" : "Exportado";
}

function statusBadgeClass(status: Transaction["status"]): string {
  if (status === "pending") return "bg-[var(--surface-subtle)] text-stone";
  if (status === "paid") return "bg-teal-dim text-teal";
  return "bg-blue-100 text-blue-700";
}

type TabValue =
  | "overview"
  | "transactions"
  | "recurring"
  | "dre"
  | "balancete"
  | "conciliacao"
  | "carne-dizimista"
  | "doacoes-publicas"
  | "pix"
  | "recibos";
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
  return formatInstant(iso, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Dia civil de Brasília: `toISOString()` já diria "amanhã" depois das 21h.
function todayIso(): string {
  return todayKey();
}

function firstOfMonthIso(): string {
  return monthRangeOf().start;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function TotalCard({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: number;
  tone: "income" | "expense";
  loading: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3">
      <p className="text-xs font-medium text-stone">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-28" />
      ) : (
        <p className={cn("mt-0.5 text-xl font-medium tabular-nums", tone === "income" ? "text-teal" : "text-crimson")}>
          {fmt(value)}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinanceiroPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Secretário e pastor são os recortes restritos do financeiro. Quem acumula
  // um papel que administra a igreja (ou o de tesoureiro) não é restrito — a
  // mesma regra do DRE na API (`isPastor` em `dre.controller.ts`).
  const managesFinance = (user?.roles ?? []).some((r) =>
    ["tenant_admin", "admin_congregation", "treasurer"].includes(r)
  );
  const isSecretary = (user?.roles?.includes("secretary") ?? false) && !managesFinance;
  const isPastor = (user?.roles?.includes("pastor") ?? false) && !managesFinance;
  const canDeleteTx =
    user?.roles?.includes("admin_congregation") || user?.roles?.includes("tenant_admin") || false;
  const canManageCategories =
    user?.roles?.includes("treasurer") ||
    user?.roles?.includes("admin_congregation") ||
    user?.roles?.includes("tenant_admin") ||
    false;

  // Abas Premium: a claim `plan` só decide se a aba aparece — quem nega de
  // verdade é o `PlanGuard` da API, e os painéis tratam o 403.
  const showPremiumTabs = canManageCategories && user?.plan === "premium";
  // PIX (QR dinâmico e recorrente) cobra pela Asaas, e a trava de pagamentos
  // está desligada para todo tenant até a subconta por igreja existir
  // (PROD-28, AD-009). Recibos e carnê não cobram nada e seguem no Premium.
  const showPixTab = showPremiumTabs && user?.asaas_payments === true;

  const [activeTab, setActiveTab] = useState<TabValue>("overview");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [costCentersOpen, setCostCentersOpen] = useState(false);

  // Transactions + categories (shared across tabs)
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  // Qual busca já terminou. "Carregando" é derivado (`loadedTxKey !== txKey`) em vez de
  // um booleano ligado dentro do efeito.
  const [loadedTxKey, setLoadedTxKey] = useState<string | null>(null);
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
  // A aba abre no mês corrente: do dia 1 ao último dia. As datas valem no
  // servidor (a lista e a apuração são do período), não só como filtro de tela.
  const [txFrom, setTxFrom] = useState(() => monthRangeOf().start);
  const [txTo, setTxTo] = useState(() => monthRangeOf().end);
  const [txTruncated, setTxTruncated] = useState(false);
  const [txLoadError, setTxLoadError] = useState(false);
  const [overviewPeriod, setOverviewPeriod] = useState<Period>(() => periodFor("month"));
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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Baixas em voo, por id. O estado só pinta a linha; quem barra o segundo
  // clique é a ref, que já vale no mesmo tick (o estado só vale no próximo render).
  const statusInFlight = useRef<Set<string>>(new Set());

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

  // ── Fetch transactions (do período) + categories ────────────────────────────
  const [txReload, setTxReload] = useState(0);
  // O caixa vem de outro endpoint e recarrega junto de qualquer mudança que
  // mexa em dinheiro: criar, editar, excluir ou pagar um lançamento.
  const [cashReload, setCashReload] = useState(0);
  const lastTxKey = useRef("");

  const loadTx = useCallback(() => {
    // Mesmo período e mesma recarga = mesma busca (StrictMode roda o efeito 2x).
    const key = `${txFrom}|${txTo}|${txReload}`;
    if (lastTxKey.current === key) return;
    lastTxKey.current = key;

    // Intervalo invertido não consulta (a lista some, ver `txRangeInvalid`);
    // `txSeq` avança para uma resposta ainda em voo não reaparecer depois.
    if (txFrom && txTo && txFrom > txTo) {
      ++txSeq.current;
      return;
    }

    const seq = ++txSeq.current;
    const { since, until } = dayRangeBounds(txFrom, txTo);
    fetchTransactionsInRange<Transaction>(since, until)
      .then(({ rows, truncated }) => {
        if (seq !== txSeq.current) return;
        setTransactions(rows);
        setTxTruncated(truncated);
        setAccessDenied(false);
        setTxLoadError(false);
      })
      .catch((error) => {
        if (seq !== txSeq.current) return;
        // Falhou: as linhas do período anterior não valem para este. Mantê-las
        // mostraria a tabela e os totais de outro intervalo sob as datas novas.
        setTransactions([]);
        setTxTruncated(false);
        // 403 não é lista vazia — ver `NoAccessState`.
        const forbidden = isForbidden(error);
        setAccessDenied(forbidden);
        setTxLoadError(!forbidden);
      })
      .finally(() => { if (seq === txSeq.current) setLoadedTxKey(key); });
  }, [txFrom, txTo, txReload]);

  useEffect(() => { loadTx(); }, [loadTx]);

  useEffect(() => {
    api
      .get<Category[]>("/financial/categories")
      .then((r) => setCategories(r.data ?? []))
      .catch(() => {});
  }, []);

  function refreshTx() {
    setTxReload((n) => n + 1);
    setCashReload((n) => n + 1);
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
    // Um aviso novo reinicia a contagem; sem isto o timer do anterior apagava o atual cedo.
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 3000);
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
    const previousStatus = tx.status;
    const nextStatus: "pending" | "paid" = previousStatus === "pending" ? "paid" : "pending";

    if (statusInFlight.current.has(tx.id)) return;
    statusInFlight.current.add(tx.id);

    setStatusUpdatingIds((prev) => new Set(prev).add(tx.id));
    setTransactions((prev) =>
      prev.map((t) => (t.id === tx.id ? { ...t, status: nextStatus } : t))
    );

    try {
      await api.patch(`/financial/transactions/${tx.id}/status`, { status: nextStatus });
      setCashReload((n) => n + 1);
    } catch {
      setTransactions((prev) =>
        prev.map((t) => (t.id === tx.id ? { ...t, status: previousStatus } : t))
      );
      showToast("Erro ao atualizar status do lançamento.");
    } finally {
      statusInFlight.current.delete(tx.id);
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
    if (activeTab !== "dre") return;
    const key = `${dreStart}|${dreEnd}`;
    if (prevDreKey.current === key) return;
    prevDreKey.current = key;
    setLoadingDre(true);
    api
      .get<DRE>(`/financial/dre?period_start=${dreStart}&period_end=${dreEnd}`)
      .then((r) => setDre(r.data))
      .catch(() => {})
      .finally(() => setLoadingDre(false));
  }, [activeTab, dreStart, dreEnd]);

  // ── Computed ─────────────────────────────────────────────────────────────────
  const txRangeInvalid = !!txFrom && !!txTo && txFrom > txTo;
  const loadingTx = !txRangeInvalid && loadedTxKey !== `${txFrom}|${txTo}|${txReload}`;
  const filteredTx = (txRangeInvalid ? [] : transactions).filter((t) => {
    if (txType && t.type !== txType) return false;
    if (txCatId && t.category_id !== txCatId) return false;
    if (txStatus && t.status !== txStatus) return false;
    return true;
  });
  // Apuração do que a tabela mostra: período + filtros ativos. `Number()` porque
  // a API devolve o Decimal como string; somar em centavos evita 0,1 + 0,2.
  const txIncomeCents = filteredTx.reduce(
    (sum, t) => (t.type === "income" ? sum + Math.round(Number(t.amount) * 100) : sum),
    0
  );
  const txExpenseCents = filteredTx.reduce(
    (sum, t) => (t.type === "expense" ? sum + Math.round(Number(t.amount) * 100) : sum),
    0
  );
  const txTotals = {
    income: txIncomeCents / 100,
    expense: txExpenseCents / 100,
    net: (txIncomeCents - txExpenseCents) / 100,
  };
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
            // A área clicável é o rótulo inteiro (32px), não os 16px da caixa:
            // acertar um alvo pequeno em tabela densa era metade da "lentidão".
            <label className="-m-2 flex cursor-pointer items-center p-2">
              <input
                type="checkbox"
                checked={r.status === "paid"}
                onChange={() => handleToggleStatus(r)}
                aria-busy={statusUpdatingIds.has(r.id)}
                aria-label={r.status === "pending" ? "Marcar como pago" : "Desfazer pagamento"}
                title={r.status === "pending" ? "Marcar como pago" : "Desfazer pagamento"}
                className="h-4 w-4 cursor-pointer accent-teal"
              />
            </label>
          )}
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-150", statusBadgeClass(r.status))}>
            {statusLabel(r.status)}
          </span>
          {statusUpdatingIds.has(r.id) && (
            <Loader2 size={12} aria-hidden="true" className="text-stone motion-safe:animate-spin" />
          )}
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
      "relative px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
      active
        ? "text-navy dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-navy"
        : "text-stone hover:text-ink dark:hover:text-white"
    );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Financeiro</h1>
          <p className="mt-0.5 text-sm text-stone">Visão geral e tesouraria</p>
        </div>
        {canManageCategories && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px]"
              aria-label="Centros de custo"
              title="Centros de custo"
              onClick={() => setCostCentersOpen(true)}
            >
              <Layers size={15} strokeWidth={1.5} />
            </Button>
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
          </div>
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
          <Tabs.Tab value="balancete" className={tabBtn(activeTab === "balancete")}>
            Balancete
          </Tabs.Tab>
          {!isPastor && (
            <Tabs.Tab value="conciliacao" className={tabBtn(activeTab === "conciliacao")}>
              Conciliação
            </Tabs.Tab>
          )}
          {!isPastor && (
            <Tabs.Tab value="carne-dizimista" className={tabBtn(activeTab === "carne-dizimista")}>
              Carnê do dizimista
            </Tabs.Tab>
          )}
          {canManageCategories && (
            <Tabs.Tab value="doacoes-publicas" className={tabBtn(activeTab === "doacoes-publicas")}>
              Doações públicas
            </Tabs.Tab>
          )}
          {showPixTab && (
            <Tabs.Tab value="pix" className={tabBtn(activeTab === "pix")}>
              PIX
            </Tabs.Tab>
          )}
          {showPremiumTabs && (
            <Tabs.Tab value="recibos" className={tabBtn(activeTab === "recibos")}>
              Recibos
            </Tabs.Tab>
          )}
        </Tabs.List>

        {/* ── Visão Geral ────────────────────────────────────────────────────── */}
        <Tabs.Panel value="overview" className="pt-5">
          <div className="space-y-5">
            <PeriodNavigator period={overviewPeriod} onChange={setOverviewPeriod} />
            {/* Intervalo livre sem data final ainda não tem fim para cortar o caixa. */}
            {DAY_KEY.test(overviewPeriod.end) && (
              <CashBalanceCard asOf={overviewPeriod.end} reloadKey={cashReload} />
            )}
            <WeeklyDashboardCard period={overviewPeriod} />
            <ForecastCard />
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
                    aria-label="Data inicial"
                    onChange={(e) => { setTxFrom(e.target.value); setTxPage(1); }}
                    className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                  />
                  <span className="text-xs text-stone">até</span>
                  <input
                    type="date"
                    value={txTo}
                    aria-label="Data final"
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

              {!txLoadError && !accessDenied && (
                <CashBalanceCard asOf={DAY_KEY.test(txTo) ? txTo : todayKey()} reloadKey={cashReload} />
              )}
              {!txLoadError && !accessDenied && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Apuração do período">
                <TotalCard label="Total de entradas" value={txTotals.income} tone="income" loading={loadingTx} />
                <TotalCard label="Total de saídas" value={txTotals.expense} tone="expense" loading={loadingTx} />
                <TotalCard
                  label="Saldo do período"
                  value={txTotals.net}
                  tone={txTotals.net >= 0 ? "income" : "expense"}
                  loading={loadingTx}
                />
              </div>
              )}
              {txTruncated && (
                <p role="status" className="rounded-[8px] bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Há mais lançamentos do que o limite de {(TX_FETCH_LIMIT * TX_MAX_PAGES).toLocaleString("pt-BR")}{" "}
                  carregados. Reduza o período para ver os totais completos.
                </p>
              )}

              <DataTable
                columns={txCols}
                rows={txPageData}
                getRowKey={(t) => t.id}
                isLoading={loadingTx}
                emptyState={
                  accessDenied ? (
                    <NoAccessState resource="Financeiro" />
                  ) : txLoadError ? (
                    "Erro ao carregar os lançamentos. Tente de novo."
                  ) : txRangeInvalid ? (
                    "A data final deve ser igual ou posterior à data inicial."
                  ) : txType || txCatId || txStatus ? (
                    "Nenhum lançamento com esses filtros."
                  ) : (
                    "Nenhum lançamento neste período."
                  )
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
                      <th className="py-2.5 pl-4 text-left text-xs font-medium text-stone">Descrição</th>
                      <th className="py-2.5 pr-4 text-left text-xs font-medium text-stone">Tipo</th>
                      <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Valor</th>
                      <th className="py-2.5 pr-4 text-left text-xs font-medium text-stone">Frequência</th>
                      <th className="py-2.5 pr-4 text-left text-xs font-medium text-stone">Próxima ocorrência</th>
                      <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">Ações</th>
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
                      <th className="py-2.5 pl-4 text-left text-xs font-medium text-stone">
                        Conta
                      </th>
                      {!isPastor && (
                        <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">
                          Total
                        </th>
                      )}
                      <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">
                        Qtd
                      </th>
                      <th className="py-2.5 pr-4 text-right text-xs font-medium text-stone">
                        Δ período ant.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* RECEITAS group */}
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
                      <td className="py-3 pl-4 text-sm font-semibold text-ink dark:text-white">Resultado líquido</td>
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

        {/* ── Balancete ──────────────────────────────────────────────────────── */}
        <Tabs.Panel value="balancete" className="pt-5">
          <BalancetePanel />
        </Tabs.Panel>

        {/* ── Conciliação ────────────────────────────────────────────────────── */}
        {!isPastor && (
          <Tabs.Panel value="conciliacao" className="pt-5">
            <BankReconciliationPanel />
          </Tabs.Panel>
        )}

        {/* ── Carnê do dizimista ─────────────────────────────────────────────── */}
        {!isPastor && (
          <Tabs.Panel value="carne-dizimista" className="pt-5">
            <DonationBookletPanel />
          </Tabs.Panel>
        )}

        {/* ── Doações públicas (todos os planos) ─────────────────────────────── */}
        {canManageCategories && (
          <Tabs.Panel value="doacoes-publicas" className="pt-5">
            <PublicIntentsPanel onSettled={refreshTx} />
          </Tabs.Panel>
        )}

        {/* ── PIX (Premium) ──────────────────────────────────────────────────── */}
        {showPixTab && (
          <Tabs.Panel value="pix" className="pt-5">
            <div className="space-y-6">
              <PixSubscriptionsPanel />
              <DynamicPixPanel />
            </div>
          </Tabs.Panel>
        )}

        {/* ── Recibos (Premium) ──────────────────────────────────────────────── */}
        {showPremiumTabs && (
          <Tabs.Panel value="recibos" className="pt-5">
            <DonationReceiptsPanel />
          </Tabs.Panel>
        )}
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

      {canManageCategories && (
        <CostCentersModal
          open={costCentersOpen}
          onOpenChange={setCostCentersOpen}
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
