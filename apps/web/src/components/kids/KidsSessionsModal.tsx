"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Baby, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api-error";
import {
  cancelSession,
  formatAgeRange,
  listRooms,
  listSessions,
  openSessions,
  type KidsRoom,
  type KidsSession,
} from "@/lib/kids";

interface KidsSessionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  /** "dom., 25/10/2026" — o culto de que se trata. */
  subtitle: string;
}

/**
 * Turmas kids de um culto (KIDS-02): 0, 1 ou N. Culto sem sessão é um estado
 * normal, não um erro — a igreja pode simplesmente não ter kids naquele dia.
 */
export function KidsSessionsModal({ open, onOpenChange, instanceId, subtitle }: KidsSessionsModalProps) {
  const [sessions, setSessions] = useState<KidsSession[]>([]);
  const [rooms, setRooms] = useState<KidsRoom[]>([]);
  const [loadedKey, setLoadedKey] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoading = loadedKey !== reloadKey;

  useEffect(() => {
    const signal = { cancelled: false };
    Promise.all([listSessions(instanceId), listRooms()])
      .then(([s, r]) => {
        if (signal.cancelled) return;
        setSessions(s);
        setRooms(r);
        setFailed(false);
      })
      .catch(() => {
        if (!signal.cancelled) setFailed(true);
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(reloadKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [instanceId, reloadKey]);

  // Sessão cancelada não libera a turma: o par instância×turma é único no
  // servidor, então a turma já usada não volta à lista de abertura.
  const used = new Set(sessions.map((s) => s.room_id));
  const available = rooms.filter((r) => !used.has(r.id));

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setPicked([]);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(apiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Turmas kids do culto" description={subtitle} className="max-w-lg">
      {isLoading ? (
        <div className="flex justify-center py-8" role="status" aria-label="Carregando turmas">
          <Loader2 size={22} className="animate-spin text-stone" />
        </div>
      ) : failed ? (
        <div role="alert" className="rounded-[12px] border border-[var(--border-default)] p-4 text-sm text-crimson">
          Não foi possível carregar as turmas deste culto.{" "}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline">
            Tentar de novo
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <section aria-label="Turmas abertas" className="flex flex-col gap-2">
            {sessions.length === 0 ? (
              <div className="flex items-center gap-2 rounded-[12px] bg-[var(--surface-subtle)] px-3 py-3 text-sm text-stone">
                <Baby size={16} strokeWidth={1.5} aria-hidden="true" />
                Este culto não tem turma kids. Abra uma abaixo se houver.
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--border-default)] rounded-[12px] border border-[var(--border-default)]">
                {sessions.map((s) => {
                  const cancelled = s.status === "cancelled";
                  return (
                    <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className={cancelled ? "text-sm text-stone line-through" : "text-sm font-medium text-ink dark:text-white"}>
                          {s.room.name}
                        </span>
                        <span className="text-xs text-stone">{formatAgeRange(s.room.min_age_months, s.room.max_age_months)}</span>
                      </div>
                      {cancelled ? (
                        <span className="rounded-full bg-crimson-dim px-2 py-0.5 text-xs font-medium text-crimson">
                          Cancelada
                        </span>
                      ) : s.volunteers_missing > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-dim px-2 py-0.5 text-xs font-medium text-amber-ink">
                          <AlertTriangle size={12} strokeWidth={1.8} aria-hidden="true" />
                          {s.volunteers_missing === 1
                            ? "Falta 1 voluntário"
                            : `Faltam ${s.volunteers_missing} voluntários`}
                        </span>
                      ) : s.room.min_volunteers > 0 ? (
                        <span className="rounded-full bg-teal-dim px-2 py-0.5 text-xs font-medium text-teal">
                          Escala completa
                        </span>
                      ) : null}
                      {!cancelled ? (
                        <button
                          type="button"
                          onClick={() => run(() => cancelSession(s.id), "Não foi possível cancelar a sessão.")}
                          disabled={busy}
                          aria-label={`Cancelar a sessão ${s.room.name}`}
                          title="Cancelar sessão"
                          className="rounded-[6px] p-1.5 text-stone outline-none hover:bg-[var(--surface-subtle)] hover:text-crimson focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
                        >
                          <X size={14} strokeWidth={1.5} />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Abrir turmas" className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-ink dark:text-white">Abrir turmas neste culto</h3>
            {available.length === 0 ? (
              <p className="text-sm text-stone">
                {rooms.length === 0
                  ? "Não há turma cadastrada. Cadastre em Kids, Turmas."
                  : "Todas as turmas ativas já foram abertas neste culto."}
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-1">
                  {available.map((r) => (
                    <li key={r.id}>
                      <label className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm text-ink hover:bg-[var(--surface-subtle)] dark:text-white">
                        <input
                          type="checkbox"
                          checked={picked.includes(r.id)}
                          onChange={() => toggle(r.id)}
                          disabled={busy}
                          className="accent-[var(--brand)]"
                        />
                        {r.name}
                        <span className="text-xs text-stone">{formatAgeRange(r.min_age_months, r.max_age_months)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={() => run(() => openSessions(instanceId, picked), "Não foi possível abrir as turmas.")}
                    disabled={busy || picked.length === 0}
                    className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                    Abrir turmas
                  </Button>
                </div>
              </>
            )}
          </section>

          {error ? (
            <p role="alert" className="text-sm text-crimson">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
