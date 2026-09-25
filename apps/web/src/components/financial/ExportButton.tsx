"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { pollExportJob } from "@/lib/exportJobPolling";

interface ExportButtonProps {
  periodStart: string;
  periodEnd: string;
}

type PdfType = "razao" | "diario";

export function ExportButton({ periodStart, periodEnd }: ExportButtonProps) {
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingOfx, setIsExportingOfx] = useState(false);
  const [isExportingSped, setIsExportingSped] = useState(false);
  const [pdfType, setPdfType] = useState<PdfType>("razao");
  const [error, setError] = useState("");
  const spedAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => spedAbortRef.current?.abort();
  }, []);

  async function downloadBlob(endpoint: string, body: object, filename: string) {
    const res = await api.post(endpoint, body, { responseType: "blob" });
    const blob = new Blob([res.data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadFromUrl(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleCsv() {
    if (!periodStart || !periodEnd) { setError("Selecione o período antes de exportar."); return; }
    setError("");
    setIsExportingCsv(true);
    try {
      await downloadBlob(
        "/financial/export/csv",
        { period_start: periodStart, period_end: periodEnd },
        `lancamentos-${periodStart}-${periodEnd}.csv`
      );
    } catch {
      setError("Erro ao exportar CSV.");
    } finally {
      setIsExportingCsv(false);
    }
  }

  async function handlePdf() {
    if (!periodStart || !periodEnd) { setError("Selecione o período antes de exportar."); return; }
    setError("");
    setIsExportingPdf(true);
    try {
      await downloadBlob(
        "/financial/export/pdf",
        { period_start: periodStart, period_end: periodEnd, type: pdfType },
        `dre-${pdfType}-${periodStart}-${periodEnd}.pdf`
      );
    } catch {
      setError("Erro ao exportar PDF.");
    } finally {
      setIsExportingPdf(false);
    }
  }

  async function handleOfx() {
    if (!periodStart || !periodEnd) { setError("Selecione o período antes de exportar."); return; }
    setError("");
    setIsExportingOfx(true);
    try {
      await downloadBlob(
        "/financial/export/ofx",
        { period_start: periodStart, period_end: periodEnd },
        `extrato-${periodStart}-${periodEnd}.ofx`
      );
    } catch {
      setError("Erro ao exportar OFX.");
    } finally {
      setIsExportingOfx(false);
    }
  }

  async function handleSped() {
    if (!periodStart || !periodEnd) { setError("Selecione o período antes de exportar."); return; }
    setError("");
    setIsExportingSped(true);
    try {
      const res = await api.post<{ job_id: string; status: string }>("/financial/export/sped", {
        period_start: periodStart,
        period_end: periodEnd,
      });
      const controller = new AbortController();
      spedAbortRef.current = controller;
      const result = await pollExportJob(res.data.job_id, { signal: controller.signal });
      if (result.status === "error") {
        setError(result.errorMessage);
        return;
      }
      downloadFromUrl(result.downloadUrl, `sped-${periodStart}-${periodEnd}.txt`);
    } catch {
      setError("Erro ao exportar SPED.");
    } finally {
      setIsExportingSped(false);
    }
  }

  const busy = isExportingCsv || isExportingPdf || isExportingOfx || isExportingSped;

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && <p className="text-xs text-crimson">{error}</p>}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-[8px]"
          onClick={handleCsv}
          disabled={busy}
        >
          {isExportingCsv
            ? <Loader2 size={13} className="animate-spin" />
            : <Download size={13} strokeWidth={1.5} />}
          CSV
        </Button>

        <div className="flex">
          <select
            value={pdfType}
            onChange={(e) => setPdfType(e.target.value as PdfType)}
            disabled={busy}
            className="h-8 rounded-l-[8px] rounded-r-none border border-r-0 border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            <option value="razao">Razão</option>
            <option value="diario">Diário</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-l-none rounded-r-[8px]"
            onClick={handlePdf}
            disabled={busy}
          >
            {isExportingPdf
              ? <Loader2 size={13} className="animate-spin" />
              : <Download size={13} strokeWidth={1.5} />}
            PDF
          </Button>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-[8px]"
          onClick={handleOfx}
          disabled={busy}
        >
          {isExportingOfx
            ? <Loader2 size={13} className="animate-spin" />
            : <Download size={13} strokeWidth={1.5} />}
          OFX
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-[8px]"
          onClick={handleSped}
          disabled={busy}
        >
          {isExportingSped
            ? <Loader2 size={13} className="animate-spin" />
            : <Download size={13} strokeWidth={1.5} />}
          SPED
        </Button>
      </div>
    </div>
  );
}
