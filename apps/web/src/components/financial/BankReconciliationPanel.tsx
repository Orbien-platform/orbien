"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatInstant } from "@/lib/datetime";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — mesmo limite do backend.

interface OfxImportReport {
  job_id: string;
  total: number;
  matched: number;
  unmatched: number;
  duplicates: number;
  errors: { row: number; reason: string }[];
}

interface BankStatementTransaction {
  id: string;
  posted_at: string;
  amount: string | number;
  is_credit: boolean;
  description: string | null;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

/**
 * Conciliação bancária (Premium) — import de extrato OFX
 * (`POST /financial/import/ofx`) e lista do que ainda não casou com nenhum
 * lançamento (`GET /financial/import/ofx/unmatched`). "Exportação contábil
 * (OFX, SPED)" na página de preços cobre o ciclo completo: exportar OFX
 * (ExportButton) e importar o extrato do banco de volta.
 */
export function BankReconciliationPanel() {
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [report, setReport] = useState<OfxImportReport | null>(null);
  const [unmatched, setUnmatched] = useState<BankStatementTransaction[]>([]);
  const [loadingUnmatched, setLoadingUnmatched] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadUnmatched = useCallback(() => {
    setLoadingUnmatched(true);
    setLoadError(false);
    api
      .get<{ data: BankStatementTransaction[]; total: number }>("/financial/import/ofx/unmatched")
      .then((res) => {
        setUnmatched(res.data.data ?? []);
        setAccessDenied(false);
      })
      .catch((error) => {
        if (isForbidden(error)) {
          setAccessDenied(true);
        } else {
          setLoadError(true);
        }
      })
      .finally(() => setLoadingUnmatched(false));
  }, []);

  const hasFetched = useRef(false);
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    loadUnmatched();
  }, [loadUnmatched]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setUploadError("Arquivo muito grande. Limite: 10 MB");
      return;
    }

    setUploadError("");
    setReport(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post<OfxImportReport>("/financial/import/ofx", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setReport(res.data);
      loadUnmatched();
    } catch (error) {
      if (isForbidden(error)) {
        setAccessDenied(true);
      } else {
        setUploadError("Erro ao importar o extrato. Confira se o arquivo é um OFX válido.");
      }
    } finally {
      setUploading(false);
    }
  }

  if (accessDenied) {
    return (
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)]">
        <NoAccessState resource="Conciliação bancária" />
      </div>
    );
  }

  const cols: Column<BankStatementTransaction>[] = [
    {
      key: "date",
      header: "Data",
      width: "110px",
      render: (r) => <span className="text-stone">{formatInstant(r.posted_at, { day: "2-digit", month: "2-digit", year: "numeric" })}</span>,
    },
    {
      key: "desc",
      header: "Descrição",
      render: (r) => <span className="text-ink dark:text-white">{r.description ?? "—"}</span>,
    },
    {
      key: "amount",
      header: "Valor",
      width: "130px",
      render: (r) => (
        <span className={cn("font-medium tabular-nums", r.is_credit ? "text-teal" : "text-crimson")}>
          {r.is_credit ? "+" : "−"}
          {fmt(Number(r.amount))}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
        <p className="text-sm font-medium text-ink dark:text-white">Importar extrato</p>
        <p className="mt-0.5 text-xs text-stone">
          Envie o arquivo OFX baixado do internet banking. Transações são casadas por valor,
          categoria e data (±3 dias) com lançamentos já pagos.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx,.qfx"
            className="hidden"
            id="ofx-file-input"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-[8px]"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} strokeWidth={1.5} />}
            Selecionar arquivo .ofx
          </Button>
        </div>

        {uploadError && <p className="mt-2 text-xs text-crimson">{uploadError}</p>}

        {report && (
          <div className="mt-3 rounded-[8px] bg-[var(--surface-subtle)] p-3 text-xs text-stone">
            <p>
              {report.total} transações no arquivo — {report.matched} casadas, {report.unmatched} não
              casadas, {report.duplicates} já importadas antes.
            </p>
            {report.errors.length > 0 && (
              <p className="mt-1 text-crimson">{report.errors.length} linha(s) com erro de formato.</p>
            )}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink dark:text-white">Transações não conciliadas</p>
        <DataTable
          columns={cols}
          rows={unmatched}
          getRowKey={(r) => r.id}
          isLoading={loadingUnmatched}
          emptyState="Nenhuma transação pendente de conciliação."
          error={loadError ? "Erro ao carregar as transações não conciliadas." : undefined}
          onRetry={loadUnmatched}
        />
      </div>
    </div>
  );
}
