"use client";

import { useEffect, useState } from "react";
import { Baby, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api-error";
import {
  applyTemplate,
  formatAgeRange,
  getTemplate,
  listRooms,
  setTemplate,
  type KidsRoom,
  type KidsTemplate,
  type KidsTemplateApplied,
} from "@/lib/kids";

function appliedMessage(r: KidsTemplateApplied): string {
  if (r.instances === 0) return "Não há datas futuras para abrir.";
  const opened = r.created === 1 ? "1 sessão aberta" : `${r.created} sessões abertas`;
  const already = r.already_open > 0 ? `, ${r.already_open} já estavam abertas` : "";
  const skipped = r.skipped_rooms > 0 ? `. ${r.skipped_rooms === 1 ? "1 turma desativada ficou de fora" : `${r.skipped_rooms} turmas desativadas ficaram de fora`}` : "";
  return `${opened} em ${r.instances === 1 ? "1 data" : `${r.instances} datas`}${already}${skipped}.`;
}

/**
 * Modelo de turmas da celebração (KIDS-03): as turmas que se repetem em todo
 * culto. Define uma vez e abre nas próximas datas de uma vez só, em vez de abrir
 * culto por culto. Aplicar é idempotente — não duplica o que já está aberto.
 */
export function KidsTemplateSection({ celebrationId }: { celebrationId: string }) {
  const [template, setTemplateState] = useState<KidsTemplate | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [rooms, setRooms] = useState<KidsRoom[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const signal = { cancelled: false };
    getTemplate(celebrationId)
      .then((t) => {
        if (signal.cancelled) return;
        setTemplateState(t);
        setFailed(false);
      })
      .catch(() => {
        if (!signal.cancelled) setFailed(true);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [celebrationId, reloadKey]);

  async function startEditing() {
    setError(null);
    setPicked(template?.room_ids ?? []);
    setEditing(true);
    try {
      setRooms(await listRooms());
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível carregar as turmas."));
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await setTemplate(celebrationId, picked);
      setEditing(false);
      setResult(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível salvar o modelo."));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(appliedMessage(await applyTemplate(celebrationId)));
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível abrir as turmas nas próximas datas."));
    } finally {
      setBusy(false);
    }
  }

  const hasTemplate = (template?.room_ids.length ?? 0) > 0;

  return (
    <section aria-label="Modelo de turmas kids" className="flex flex-col gap-2 border-b border-[var(--border-default)] px-4 py-3">
      <div className="flex items-center gap-2">
        <Baby size={14} strokeWidth={1.5} className="text-stone" aria-hidden="true" />
        <span className="text-sm font-medium text-ink dark:text-white">Turmas kids padrão</span>
        <button
          type="button"
          onClick={startEditing}
          className="ml-auto rounded-[8px] px-2 py-1 text-xs text-stone outline-none hover:bg-[var(--surface-subtle)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:text-white"
        >
          {hasTemplate ? "Editar modelo" : "Definir modelo"}
        </button>
      </div>

      {failed ? (
        <p role="alert" className="text-xs text-crimson">
          Não foi possível carregar o modelo de turmas.
        </p>
      ) : template === null ? null : hasTemplate ? (
        <>
          <p className="text-sm text-stone">{template.rooms.map((r) => r.name).join(", ")}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-medium text-ink outline-none transition-colors hover:border-teal hover:text-teal focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 dark:text-white"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : null}
              Abrir nas próximas datas
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-stone">Sem modelo. Defina as turmas que se repetem em todo culto.</p>
      )}

      {result ? (
        <p role="status" className="text-xs text-teal">
          {result}
        </p>
      ) : null}
      {error && !editing ? (
        <p role="alert" className="text-xs text-crimson">
          {error}
        </p>
      ) : null}

      <Modal open={editing} onOpenChange={setEditing} title="Turmas kids padrão" description="Marque as turmas que abrem em todo culto desta celebração.">
        {rooms.length === 0 && !error ? (
          <p className="text-sm text-stone">Não há turma cadastrada. Cadastre em Kids, Turmas.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rooms.map((r) => (
              <li key={r.id}>
                <label className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm text-ink hover:bg-[var(--surface-subtle)] dark:text-white">
                  <input
                    type="checkbox"
                    checked={picked.includes(r.id)}
                    onChange={() => setPicked((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id]))}
                    disabled={busy}
                    className="accent-[var(--brand)]"
                  />
                  {r.name}
                  <span className="text-xs text-stone">{formatAgeRange(r.min_age_months, r.max_age_months)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-crimson">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Voltar
          </button>
          <Button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Salvar modelo
          </Button>
        </div>
      </Modal>
    </section>
  );
}
