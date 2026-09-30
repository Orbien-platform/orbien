"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";

interface DonationReceipt {
  id: string;
  generated_at: string;
  person_name: string;
  amount: string;
  occurred_at: string;
}

interface ReceiptsPage {
  data: DonationReceipt[];
  total: number;
}

const PAGE_SIZE = 20;

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  return formatInstant(iso, { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Recibos de doação (Premium). O PDF nasce fora de request, quando a Asaas
 * confirma o PIX de um doador identificado (`PROD-03`); aqui só se lista e se
 * baixa. O download é um link assinado de vida curta — pedido a cada clique,
 * nunca guardado na tela.
 */
export function DonationReceiptsPanel() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<DonationReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const requestSeq = useRef(0);
  const prevPage = useRef<number | null>(null);

  const load = useCallback((p: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(false);
    api
      .get<ReceiptsPage>(`/financial/donation-receipts?page=${p}&page_size=${PAGE_SIZE}`)
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setRows(res.data.data ?? []);
        setTotal(res.data.total ?? 0);
        setAccessDenied(false);
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        if (isForbidden(err)) setAccessDenied(true);
        else setLoadError(true);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (prevPage.current === page) return;
    prevPage.current = page;
    load(page);
  }, [page, load]);

  async function handleDownload(id: string) {
    setError("");
    setDownloadingId(id);
    try {
      const res = await api.get<{ download_url: string; expires_in: number }>(
        `/financial/donation-receipts/${id}/download`,
      );
      window.open(res.data.download_url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Não foi possível gerar o link do recibo. Tente de novo.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="Recibos de doação" />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cols: Column<DonationReceipt>[] = [
    {
      key: "person",
      header: "Doador",
      render: (r) => <span className="font-medium text-ink dark:text-white">{r.person_name}</span>,
    },
    {
      key: "amount",
      header: "Valor",
      width: "130px",
      render: (r) => <span className="tabular-nums text-ink dark:text-white">{fmt(Number(r.amount))}</span>,
    },
    {
      key: "occurred",
      header: "Data da doação",
      width: "140px",
      render: (r) => <span className="text-stone">{fmtDate(r.occurred_at)}</span>,
    },
    {
      key: "generated",
      header: "Recibo emitido em",
      width: "150px",
      render: (r) => <span className="text-stone">{fmtDate(r.generated_at)}</span>,
    },
    {
      key: "actions",
      header: "Ações",
      width: "130px",
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-[8px]"
          disabled={downloadingId === r.id}
          onClick={() => handleDownload(r.id)}
          aria-label={`Baixar recibo de ${r.person_name}`}
        >
          {downloadingId === r.id ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Download size={13} strokeWidth={1.5} />
          )}
          Baixar
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-ink dark:text-white">Recibos de doação</p>
        <p className="mt-0.5 text-xs text-stone">
          Emitidos automaticamente quando um PIX de doador identificado é confirmado.
        </p>
      </div>

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
        emptyState="Nenhum recibo emitido ainda."
        error={loadError ? "Erro ao carregar os recibos." : undefined}
        onRetry={() => load(page)}
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
