"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface DrePdfButtonProps {
  periodStart: string;
  periodEnd: string;
  /** "" = todos os centros; "none" = sem centro; senão o id do centro. */
  costCenterId: string;
}

/** Mesmo nome que a API põe no `Content-Disposition`: `orbien_dre_AAAAMM[_AAAAMM].pdf`. */
function fileName(periodStart: string, periodEnd: string): string {
  const s = periodStart.replace(/-/g, "").slice(0, 6);
  const e = periodEnd.replace(/-/g, "").slice(0, 6);
  return `orbien_dre_${s}${s === e ? "" : `_${e}`}.pdf`;
}

/**
 * Baixa o DRE do período em PDF (`POST /financial/dre/export/pdf`). Só leitura:
 * gerar o PDF não altera nenhum lançamento. É separado do `ExportButton`, cujo
 * PDF é o razão/diário.
 */
export function DrePdfButton({ periodStart, periodEnd, costCenterId }: DrePdfButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (!periodStart || !periodEnd) {
      setError("Selecione o período antes de exportar.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.post(
        "/financial/dre/export/pdf",
        {
          period_start: periodStart,
          period_end: periodEnd,
          ...(costCenterId ? { cost_center_id: costCenterId } : {}),
        },
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName(periodStart, periodEnd);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Erro ao exportar o DRE.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {error && (
        <p role="alert" className="text-xs text-crimson">
          {error}
        </p>
      )}
      <Button variant="outline" size="sm" className="gap-1.5 rounded-[8px]" onClick={handleClick} disabled={busy}>
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} strokeWidth={1.5} />}
        DRE (PDF)
      </Button>
    </div>
  );
}
