"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";

interface AnnualDonorSummary {
  person_id: string;
  person_name: string;
  total: number;
  count: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

function yearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2];
}

/**
 * Carnê do dizimista / relatório anual para IR (Premium) —
 * `AnnualDonationReportService`. Lista os doadores identificados de um ano
 * (`GET .../annual/summary`) e baixa o PDF individual de cada um
 * (`GET .../annual/:personId`). Sem geração em lote de propósito: fora do
 * escopo desta entrega (ver `.specs/features/financeiro-ui-premium`).
 */
export function DonationBookletPanel() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [donors, setDonors] = useState<AnnualDonorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const requestSeq = useRef(0);
  const prevYear = useRef<number | null>(null);

  const loadDonors = useCallback((y: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setLoadError(false);
    api
      .get<AnnualDonorSummary[]>(`/financial/donation-receipts/annual/summary?year=${y}`)
      .then((res) => {
        if (seq !== requestSeq.current) return;
        setDonors(res.data ?? []);
        setAccessDenied(false);
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        if (isForbidden(err)) {
          setAccessDenied(true);
        } else {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (prevYear.current === year) return;
    prevYear.current = year;
    loadDonors(year);
  }, [year, loadDonors]);

  async function handleDownload(personId: string) {
    setError("");
    setDownloadingId(personId);
    try {
      const res = await api.get(`/financial/donation-receipts/annual/${personId}?year=${year}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carne-dizimista-${year}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Erro ao baixar o carnê.");
    } finally {
      setDownloadingId(null);
    }
  }

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="Carnê do dizimista" />
      </div>
    );
  }

  const cols: Column<AnnualDonorSummary>[] = [
    {
      key: "name",
      header: "Doador",
      render: (r) => <span className="font-medium text-ink dark:text-white">{r.person_name}</span>,
    },
    {
      key: "count",
      header: "Doações",
      width: "100px",
      render: (r) => <span className="text-stone">{r.count}</span>,
    },
    {
      key: "total",
      header: "Total no ano",
      width: "140px",
      render: (r) => <span className="font-medium tabular-nums text-ink dark:text-white">{fmt(r.total)}</span>,
    },
    {
      key: "actions",
      header: "Ações",
      width: "140px",
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-[8px]"
          disabled={downloadingId === r.person_id}
          onClick={() => handleDownload(r.person_id)}
        >
          {downloadingId === r.person_id
            ? <Loader2 size={13} className="animate-spin" />
            : <Download size={13} strokeWidth={1.5} />}
          Baixar carnê
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink dark:text-white">Carnê do dizimista</p>
          <p className="mt-0.5 text-xs text-stone">Comprovante anual de doações para declaração de IR.</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
        >
          {yearOptions().map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-crimson">{error}</p>}

      <DataTable
        columns={cols}
        rows={donors}
        getRowKey={(r) => r.person_id}
        isLoading={loading}
        emptyState="Nenhum doador identificado neste ano."
        error={loadError ? "Erro ao carregar os doadores." : undefined}
        onRetry={() => loadDonors(year)}
      />
    </div>
  );
}
