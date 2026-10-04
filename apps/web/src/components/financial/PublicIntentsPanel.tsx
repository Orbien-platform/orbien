"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatInstant } from "@/lib/datetime";
import { cn } from "@/lib/utils";

type IntentStatus = "pending" | "confirmed" | "failed";

interface PublicIntent {
  id: string;
  reference: string;
  amount: string;
  status: IntentStatus;
  /** `static`: chave copiada e paga fora; `dynamic`: QR da Asaas, confirma sozinho. */
  mode: "static" | "dynamic";
  donor_name: string | null;
  donor_email: string | null;
  category_name: string;
  created_at: string;
}

interface IntentsPage {
  data: PublicIntent[];
  total: number;
}

type Filter = "pending" | "all";

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<IntentStatus, string> = {
  pending: "Pendente",
  confirmed: "Recebida",
  failed: "Vencida",
};

const STATUS_STYLE: Record<IntentStatus, string> = {
  pending: "bg-navy-dim text-navy",
  confirmed: "bg-teal-dim text-teal",
  failed: "bg-[var(--surface-subtle)] text-stone",
};

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

/**
 * Doações feitas pela página pública `/doar/[igreja]` (PEND-14). A chave
 * estática é paga fora do Orbien — só quem vê o extrato pode dizer que o PIX
 * chegou, e é aqui que a baixa vira lançamento. QR dinâmico se confirma sozinho
 * pela Asaas: aparece na lista para acompanhar, sem botão.
 *
 * A baixa cria receita, então pede confirmação com o valor na tela antes de
 * enviar — não há "desfazer" pelo painel. Nome e e-mail são o que o doador
 * declarou, sem verificação: servem para casar com o extrato, não como prova.
 */
export function PublicIntentsPanel({ onSettled }: { onSettled?: () => void }) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PublicIntent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const loadedKey = useRef<string | null>(null);

  const load = useCallback((p: number, f: Filter) => {
    setLoading(true);
    setLoadError(false);
    const status = f === "pending" ? "&status=pending" : "";
    api
      .get<IntentsPage>(`/financial/pix/public-intents?page=${p}&page_size=${PAGE_SIZE}${status}`)
      .then((res) => {
        setRows(res.data.data);
        setTotal(res.data.total);
        setAccessDenied(false);
      })
      .catch((err) => {
        if (isForbidden(err)) setAccessDenied(true);
        else setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const key = `${page}:${filter}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    load(page, filter);
  }, [page, filter, load]);

  function changeFilter(next: Filter) {
    if (next === filter) return;
    setFilter(next);
    setPage(1);
    setConfirmingId(null);
    setError("");
    setNotice("");
  }

  async function handleSettle(intent: PublicIntent) {
    setError("");
    setNotice("");
    setSettlingId(intent.id);
    try {
      await api.post(`/financial/pix/public-intents/${intent.id}/settle`);
      setConfirmingId(null);
      setNotice(`Baixa de ${intent.reference} registrada. O lançamento já está no financeiro.`);
      load(page, filter);
      onSettled?.();
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível dar baixa. Tente de novo."));
    } finally {
      setSettlingId(null);
    }
  }

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="Doações públicas" />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cols: Column<PublicIntent>[] = [
    {
      key: "reference",
      header: "Referência",
      width: "130px",
      render: (r) => <span className="font-mono text-xs text-ink dark:text-white">{r.reference}</span>,
    },
    {
      key: "donor",
      header: "Doador (declarado)",
      render: (r) =>
        r.donor_name || r.donor_email ? (
          <div className="min-w-0">
            <p className="truncate font-medium text-ink dark:text-white">{r.donor_name ?? r.donor_email}</p>
            {r.donor_name && r.donor_email && <p className="truncate text-xs text-stone">{r.donor_email}</p>}
          </div>
        ) : (
          <span className="text-stone">Anônimo</span>
        ),
    },
    {
      key: "amount",
      header: "Valor",
      width: "120px",
      render: (r) => <span className="tabular-nums text-ink dark:text-white">{fmt(Number(r.amount))}</span>,
    },
    {
      key: "created",
      header: "Registrada em",
      width: "150px",
      render: (r) => (
        <span className="text-stone">
          {formatInstant(r.created_at, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "status",
      header: "Situação",
      width: "110px",
      render: (r) => (
        <span
          className={cn(
            "inline-flex items-center rounded-[100px] px-2 py-0.5 text-xs font-medium",
            STATUS_STYLE[r.status],
          )}
        >
          {STATUS_LABEL[r.status]}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      width: "230px",
      render: (r) => {
        if (r.status === "confirmed") return <span className="text-stone">—</span>;
        if (r.mode === "dynamic" && r.status === "pending") {
          return <span className="text-xs text-stone">Confirma sozinha pela Asaas</span>;
        }
        if (r.mode === "dynamic") return <span className="text-stone">—</span>;

        if (confirmingId === r.id) {
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
                disabled={settlingId === r.id}
                onClick={() => handleSettle(r)}
              >
                {settlingId === r.id && <Loader2 size={13} className="animate-spin" />}
                Confirmar {fmt(Number(r.amount))}
              </Button>
              <button
                type="button"
                className="text-xs text-stone underline-offset-2 hover:underline"
                disabled={settlingId === r.id}
                onClick={() => setConfirmingId(null)}
              >
                Cancelar
              </button>
            </div>
          );
        }

        return (
          <Button
            variant="outline"
            size="sm"
            className="rounded-[8px]"
            onClick={() => setConfirmingId(r.id)}
            aria-label={`Marcar ${r.reference} como recebida`}
          >
            Marcar como recebida
          </Button>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-ink dark:text-white">Doações públicas</p>
        <p className="mt-0.5 text-xs text-stone">
          Doações feitas pela página de doação da igreja. Confira o PIX no extrato e marque como
          recebida para lançar a receita; as com QR code se confirmam sozinhas.
        </p>
      </div>

      <div className="flex gap-2" role="group" aria-label="Filtrar por situação">
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => changeFilter(f)}
            className={cn(
              "rounded-[100px] border px-3 py-1 text-xs font-medium",
              filter === f
                ? "border-navy bg-navy-dim text-navy"
                : "border-[var(--border-default)] text-stone hover:bg-[var(--surface-subtle)]",
            )}
          >
            {f === "pending" ? "Pendentes" : "Todas"}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="text-xs text-teal">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-crimson">
          {error}
        </p>
      )}

      <DataTable
        columns={cols}
        rows={rows}
        getRowKey={(r) => r.id}
        isLoading={loading}
        emptyState={
          filter === "pending" ? "Nenhuma doação pública pendente." : "Nenhuma doação pública ainda."
        }
        error={loadError ? "Erro ao carregar as doações públicas." : undefined}
        onRetry={() => load(page, filter)}
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-xs text-stone">
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            aria-label="Página anterior"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[var(--border-default)] hover:bg-[var(--surface-subtle)] disabled:opacity-40"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Próxima página"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[var(--border-default)] hover:bg-[var(--surface-subtle)] disabled:opacity-40"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
