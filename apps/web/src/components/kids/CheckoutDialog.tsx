"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AllergyNote } from "@/components/kids/AllergyNote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api-error";
import {
  checkOut,
  checkOutOverride,
  getChild,
  kidsErrorStatus,
  normalizeCode,
  CODE_LENGTH,
  type KidsGuardian,
  type KidsRosterItem,
} from "@/lib/kids";

/** A recusa é uma só, para código errado e para quem não pode retirar: a tela não revela qual. */
export const REFUSAL = "Este código não é de quem está buscando. Chame o líder kids.";

interface CheckoutDialogProps {
  item: KidsRosterItem;
  /** Líder kids: pode autorizar a saída por exceção, com motivo. */
  canOverride: boolean;
  onClose: () => void;
  onDone: () => void;
}

/**
 * Entregar a criança (KIDS-09). O responsável diz o código; a equipe o digita e
 * indica quem está buscando. Código que não confere recusa de forma genérica —
 * o caminho para quem esqueceu o código é a exceção do líder, com motivo gravado.
 */
export function CheckoutDialog({ item, canOverride, onClose, onDone }: CheckoutDialogProps) {
  const [guardians, setGuardians] = useState<KidsGuardian[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [guardianId, setGuardianId] = useState("");
  const [code, setCode] = useState("");
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState("");
  const [pickerName, setPickerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const signal = { cancelled: false };
    getChild(item.child.id)
      .then((f) => {
        if (signal.cancelled) return;
        setGuardians(f.guardians);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!signal.cancelled) setLoadFailed(true);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [item.child.id, loadKey]);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await checkOut(item.checkin_id, { code, picked_up_by_person_id: guardianId });
      onDone();
    } catch (err) {
      if (kidsErrorStatus(err) === 403) {
        setError(REFUSAL);
        setCode("");
      } else {
        setError(apiErrorMessage(err, "Não foi possível entregar a criança. Tente de novo."));
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmOverride() {
    setBusy(true);
    setError(null);
    try {
      await checkOutOverride(item.checkin_id, { reason: reason.trim(), picked_up_by_name: pickerName.trim() });
      onDone();
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível autorizar a saída. Tente de novo."));
    } finally {
      setBusy(false);
    }
  }

  const title = override ? "Líder autoriza a saída" : "Entregar criança";

  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={title} description={item.child.full_name}>
      {item.has_allergy ? <AllergyNote allergy={item.allergies} className="mb-4" /> : null}

      {override ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-stone">
            Use quando o responsável não tem o código. Confira o documento de quem busca: o motivo fica gravado.
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ov-name" className="text-sm font-medium text-ink dark:text-white">
              Quem está buscando
            </Label>
            <Input
              id="ov-name"
              value={pickerName}
              onChange={(e) => setPickerName(e.target.value)}
              disabled={busy}
              className="rounded-[8px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ov-reason" className="text-sm font-medium text-ink dark:text-white">
              Motivo
            </Label>
            <textarea
              id="ov-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              placeholder="ex: perdeu a etiqueta; conferi o RG"
              className="min-h-[4.5rem] w-full rounded-[8px] border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
            <span className="text-xs text-stone">Pelo menos 5 caracteres.</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {loadFailed ? (
            <div role="alert" className="rounded-[12px] border border-[var(--border-default)] p-3 text-sm text-crimson">
              Não foi possível carregar os responsáveis.{" "}
              <button type="button" onClick={() => setLoadKey((k) => k + 1)} className="underline">
                Tentar de novo
              </button>
            </div>
          ) : guardians === null ? (
            <div className="flex justify-center py-4" role="status" aria-label="Carregando responsáveis">
              <Loader2 size={20} className="animate-spin text-stone" />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <Label htmlFor="co-guardian" className="text-sm font-medium text-ink dark:text-white">
                Quem está buscando
              </Label>
              <select
                id="co-guardian"
                value={guardianId}
                onChange={(e) => setGuardianId(e.target.value)}
                disabled={busy}
                className="h-9 rounded-[8px] border border-input bg-transparent px-2 text-sm text-ink focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-white"
              >
                <option value="">Escolha a pessoa</option>
                {guardians.map((g) => (
                  <option key={g.id} value={g.guardian_person_id}>
                    {g.full_name} ({g.relationship})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label htmlFor="co-code" className="text-sm font-medium text-ink dark:text-white">
              Código de retirada
            </Label>
            <Input
              id="co-code"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={CODE_LENGTH}
              className="h-14 max-w-[11rem] rounded-[10px] text-center font-mono text-3xl font-semibold tracking-[0.3em] tabular-nums"
            />
          </div>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-4 rounded-[8px] bg-crimson-dim px-3 py-2 text-sm font-medium text-crimson">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-2">
        {canOverride ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setOverride((o) => !o);
            }}
            disabled={busy}
            className="rounded-[8px] px-2 py-1.5 text-sm text-stone underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {override ? "Voltar ao código" : "Sem o código? Líder autoriza a saída"}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Cancelar
          </button>
          {override ? (
            <Button
              type="button"
              onClick={confirmOverride}
              disabled={busy || reason.trim().length < 5 || pickerName.trim() === ""}
              className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Autorizar saída
            </Button>
          ) : (
            <Button
              type="button"
              onClick={confirm}
              disabled={busy || code.length !== CODE_LENGTH || guardianId === ""}
              className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              Entregar criança
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
