"use client";

import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { UploadCloud, Loader2, CheckCircle2, AlertCircle, FileText, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportPreview {
  columns: string[];
  preview_rows: Record<string, string>[];
  suggested_mapping?: Record<string, string>;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

const ORBIEN_FIELDS = [
  { value: "", label: "— Ignorar coluna —" },
  { value: "full_name", label: "Nome completo *" },
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "birth_date", label: "Data de nascimento" },
  { value: "gender", label: "Gênero" },
  { value: "classification", label: "Classificação" },
];

interface ImportCsvModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportCsvModal({
  open,
  onOpenChange,
  onImported,
}: ImportCsvModalProps) {
  const [step, setStep] = useState<"upload" | "mapping" | "result">("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("upload");
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setError("");
    setIsLoading(false);
  }

  async function uploadFile(f: File) {
    setFile(f);
    setError("");
    setIsLoading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const { data } = await api.post<ImportPreview>("/persons/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPreview(data);
      const initial: Record<string, string> = {};
      for (const col of data.columns) {
        initial[col] = data.suggested_mapping?.[col] ?? "";
      }
      setMapping(initial);
      setStep("mapping");
    } catch {
      setError("Não foi possível processar o arquivo. Verifique se é um CSV válido.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) uploadFile(f);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.name.endsWith(".csv")) uploadFile(f);
    else setError("Apenas arquivos .csv são aceitos.");
  }

  async function handleConfirm() {
    setError("");
    setIsLoading(true);
    try {
      const { data } = await api.post<ImportResult>("/persons/import/confirm", { mapping });
      setResult(data);
      setStep("result");
    } catch {
      setError("Erro ao importar. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Importar CSV"
      description={
        step === "upload" ? "Importe múltiplos contatos de uma planilha."
        : step === "mapping" ? "Mapeie as colunas do CSV para os campos do Orbien."
        : "Importação concluída."
      }
      className="max-w-lg"
    >
      {/* ── Step 1: Upload ── */}
      {step === "upload" && (
        <div className="flex flex-col gap-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-3 rounded-[12px] border-2 border-dashed p-8 transition-colors",
              isDragging
                ? "border-navy bg-navy-dim"
                : "border-[var(--border-default)] hover:border-navy/40 hover:bg-[var(--surface-subtle)]"
            )}
          >
            <UploadCloud size={36} strokeWidth={1.3} className="text-stone" />
            <div className="text-center">
              <p className="text-sm font-medium text-ink dark:text-white">
                Arraste um arquivo .csv aqui
              </p>
              <p className="mt-0.5 text-xs text-stone">ou clique para selecionar</p>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileInput}
          />
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-stone">
              <Loader2 size={15} className="animate-spin" />
              Processando arquivo…
            </div>
          )}
          {error && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{error}</p>
          )}
        </div>
      )}

      {/* ── Step 2: Mapping ── */}
      {step === "mapping" && preview && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 rounded-[8px] bg-[var(--surface-subtle)] px-3 py-2">
            <FileText size={14} strokeWidth={1.5} className="text-stone" />
            <span className="text-xs text-stone">{file?.name}</span>
            <button
              aria-label="Remover arquivo"
              onClick={() => { setStep("upload"); setFile(null); setPreview(null); }}
              className="ml-auto text-stone hover:text-crimson"
            >
              <X size={13} />
            </button>
          </div>

          <p className="text-xs text-stone">
            {preview.preview_rows.length} linha(s) de prévia · {preview.columns.length} colunas detectadas
          </p>

          <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
            {preview.columns.map((col) => (
              <div key={col} className="flex items-center gap-2">
                <span className="w-1/2 truncate text-xs font-medium text-ink dark:text-white" title={col}>
                  {col}
                </span>
                <select
                  value={mapping[col] ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [col]: e.target.value }))}
                  className="h-7 flex-1 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                >
                  {ORBIEN_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {error && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-[8px]"
              onClick={() => setStep("upload")}
              disabled={isLoading}
            >
              Voltar
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : "Importar"}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ── */}
      {step === "result" && result && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[12px] border border-[var(--border-default)] bg-teal-dim p-4 text-center">
              <p className="text-2xl font-medium text-teal">{result.imported}</p>
              <p className="mt-0.5 text-xs text-stone">importados</p>
            </div>
            <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-4 text-center">
              <p className="text-2xl font-medium text-ink dark:text-white">{result.skipped}</p>
              <p className="mt-0.5 text-xs text-stone">ignorados</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-[12px] border border-crimson/20 bg-crimson-dim p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-crimson">
                <AlertCircle size={13} />
                {result.errors.length} erro(s)
              </p>
              <ul className="space-y-0.5">
                {result.errors.slice(0, 5).map((e, i) => (
                  <li key={i} className="text-xs text-crimson">{e}</li>
                ))}
                {result.errors.length > 5 && (
                  <li className="text-xs text-stone">…e mais {result.errors.length - 5}</li>
                )}
              </ul>
            </div>
          )}

          {result.errors.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-teal">
              <CheckCircle2 size={16} strokeWidth={1.5} />
              Importação concluída sem erros!
            </div>
          )}

          <Button
            type="button"
            onClick={() => { onImported(); onOpenChange(false); reset(); }}
            className="w-full rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
          >
            Concluir
          </Button>
        </div>
      )}
    </Modal>
  );
}
