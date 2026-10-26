"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, Loader2, Printer } from "lucide-react";
import { AllergyNote } from "@/components/kids/AllergyNote";
import { PickupCode } from "@/components/kids/PickupCode";
import { PrintLabels } from "@/components/kids/PrintLabels";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api-error";
import {
  checkIn,
  formatAge,
  formatAgeRange,
  getChild,
  kidsErrorCode,
  kidsErrorStatus,
  type KidsChild,
  type KidsCheckinResult,
  type KidsFicha,
  type KidsGuardian,
} from "@/lib/kids";

interface CheckinDialogProps {
  sessionId: string;
  roomName: string;
  child: KidsChild;
  onClose: () => void;
  /** O check-in foi feito: o balcão recarrega o roster. */
  onCheckedIn: () => void;
}

interface RangeAsk {
  age_months: number;
  min_age_months: number;
  max_age_months: number;
}

function rangeFrom(err: unknown): RangeAsk | null {
  if (!axios.isAxiosError(err)) return null;
  const d = err.response?.data;
  if (typeof d?.age_months !== "number") return null;
  return { age_months: d.age_months, min_age_months: d.min_age_months, max_age_months: d.max_age_months };
}

/**
 * Check-in no balcão (KIDS-08). Três momentos: escolher quem entrega a criança,
 * confirmar quando ela está fora da faixa da turma (só se a turma aceitar), e a
 * confirmação com o código de retirada em tamanho grande — é por ali que a
 * equipe o repassa ao responsável, já que o balcão não o relê depois.
 */
export function CheckinDialog({ sessionId, roomName, child, onClose, onCheckedIn }: CheckinDialogProps) {
  const [ficha, setFicha] = useState<KidsFicha | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [guardianId, setGuardianId] = useState<string>("");
  const [ask, setAsk] = useState<RangeAsk | null>(null);
  const [result, setResult] = useState<KidsCheckinResult | null>(null);
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    const signal = { cancelled: false };
    getChild(child.id)
      .then((f) => {
        if (signal.cancelled) return;
        setFicha(f);
        setLoadFailed(false);
        setGuardianId((f.guardians.find((g) => g.is_primary) ?? f.guardians[0])?.guardian_person_id ?? "");
      })
      .catch(() => {
        if (!signal.cancelled) setLoadFailed(true);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [child.id, loadKey]);

  async function submit(confirmOutOfRange: boolean) {
    setBusy(true);
    setError(null);
    try {
      const r = await checkIn(sessionId, {
        child_id: child.id,
        guardian_person_id: guardianId,
        ...(confirmOutOfRange && { confirm_out_of_range: true }),
      });
      setAsk(null);
      setResult(r);
      onCheckedIn();
    } catch (err) {
      const code = kidsErrorCode(err);
      const range = code === "OUT_OF_RANGE_CONFIRM" ? rangeFrom(err) : null;
      if (range) {
        setAsk(range);
      } else if (code === "kids_out_of_range") {
        setError("Criança fora da faixa etária da turma");
      } else if (kidsErrorStatus(err) === 409) {
        setError("Esta criança já está presente");
      } else if (code === "kids_consent_required") {
        setError(`${apiErrorMessage(err, "É preciso o consentimento do responsável.")}. Registre-o na ficha da criança.`);
      } else {
        setError(apiErrorMessage(err, "Não foi possível fazer o check-in. Tente de novo."));
      }
    } finally {
      setBusy(false);
    }
  }

  const stopPrinting = useCallback(() => setPrinting(false), []);

  // ─── Confirmação: o código grande ───
  if (result) {
    return (
      <>
        <Modal open onOpenChange={(next) => !next && onClose()} title="Check-in feito" description={`${child.full_name} · ${roomName}`} className="max-w-xl">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-stone">
              Passe este código ao responsável. Sem ele a criança não sai: a equipe não consegue relê-lo depois.
            </p>
            <div className="w-full overflow-x-auto py-2">
              <PickupCode code={result.code} size="xl" />
            </div>
            {result.labels.child_label.has_allergy ? <AllergyNote allergy={result.labels.child_label.allergy} /> : null}
            {result.age_override ? (
              <p className="text-sm text-stone">Criança fora da faixa da turma, confirmada pela equipe.</p>
            ) : null}
            {result.capacity_warning ? (
              <p role="status" className="flex items-center gap-1.5 rounded-[8px] bg-amber-dim px-2 py-1 text-sm font-medium text-amber-ink">
                <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
                Turma na capacidade: {result.capacity_warning.present} de {result.capacity_warning.capacity}. Pode seguir.
              </p>
            ) : null}
          </div>
          <div className="mt-6 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPrinting(true)}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors hover:border-teal hover:text-teal focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-white"
            >
              <Printer size={14} strokeWidth={1.6} aria-hidden="true" />
              Imprimir etiqueta
            </button>
            <Button
              type="button"
              onClick={onClose}
              className="rounded-[8px] bg-navy px-4 py-1.5 text-sm text-white hover:bg-navy/90"
            >
              Concluir
            </Button>
          </div>
        </Modal>
        {printing ? <PrintLabels labels={result.labels} onDone={stopPrinting} /> : null}
      </>
    );
  }

  // ─── Fora da faixa: confirmação da equipe ───
  if (ask) {
    return (
      <Modal open onOpenChange={(next) => !next && onClose()} title="Criança fora da faixa etária" description={`${child.full_name} · ${roomName}`}>
        <p className="text-sm text-ink dark:text-white">
          {child.full_name} tem {formatAge(ask.age_months)} e a turma {roomName} é de{" "}
          {formatAgeRange(ask.min_age_months, ask.max_age_months)}. Esta turma aceita crianças fora da faixa.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-crimson">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setAsk(null)}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Voltar
          </button>
          <Button
            type="button"
            onClick={() => submit(true)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Fazer check-in mesmo assim
          </Button>
        </div>
      </Modal>
    );
  }

  // ─── Quem entrega ───
  const guardians: KidsGuardian[] = ficha?.guardians ?? [];
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title="Fazer check-in" description={`${child.full_name} · ${roomName}`}>
      {loadFailed ? (
        <div role="alert" className="rounded-[12px] border border-[var(--border-default)] p-4 text-sm text-crimson">
          Não foi possível carregar os responsáveis.{" "}
          <button type="button" onClick={() => setLoadKey((k) => k + 1)} className="underline">
            Tentar de novo
          </button>
        </div>
      ) : ficha === null ? (
        <div className="flex justify-center py-6" role="status" aria-label="Carregando responsáveis">
          <Loader2 size={20} className="animate-spin text-stone" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AllergyNote allergy={ficha.allergies} />
          {guardians.length === 0 ? (
            <p className="text-sm text-stone">Esta criança não tem responsável cadastrado. Cadastre um na ficha.</p>
          ) : (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium text-ink dark:text-white">Quem está entregando a criança</legend>
              {guardians.map((g) => (
                <label
                  key={g.id}
                  className="flex items-center gap-2 rounded-[8px] px-2 py-2 text-sm text-ink hover:bg-[var(--surface-subtle)] dark:text-white"
                >
                  <input
                    type="radio"
                    name="checkin-guardian"
                    checked={guardianId === g.guardian_person_id}
                    onChange={() => setGuardianId(g.guardian_person_id)}
                    disabled={busy}
                    className="accent-[var(--brand)]"
                  />
                  {g.full_name}
                  <span className="text-xs text-stone">{g.relationship}</span>
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-crimson">
          {error}
        </p>
      ) : null}
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
        >
          Voltar
        </button>
        <Button
          type="button"
          onClick={() => submit(false)}
          disabled={busy || guardianId === ""}
          className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Fazer check-in
        </Button>
      </div>
    </Modal>
  );
}
