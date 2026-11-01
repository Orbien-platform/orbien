"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";

export interface AttendanceCounts {
  children: number;
  members: number;
  attendees: number;
  visitors: number;
  total: number;
}

type Field = "children" | "members" | "attendees" | "visitors";

// A ordem é a da tela. As quatro categorias não se sobrepõem: o total é a soma.
const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: "children", label: "Crianças", hint: "Todas as crianças, mesmo as de famílias membros" },
  { key: "members", label: "Membros", hint: "Adultos e jovens membros" },
  { key: "attendees", label: "Frequentadores", hint: "Vêm com regularidade, ainda sem ser membros" },
  { key: "visitors", label: "Visitantes", hint: "Primeira ou segunda vez" },
];

const MAX = 100000;

function parse(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value);
  return n <= MAX ? n : null;
}

interface AttendanceFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  /** "Culto de domingo, 18/10" — o que a pessoa está contando. */
  subtitle: string;
  initial: Omit<AttendanceCounts, "total"> | null;
  /**
   * Crianças distintas com check-in no culto (módulo Kids). Vira o valor
   * inicial de "Crianças" quando ainda não há contagem lançada e fica visível
   * ao lado depois — o que vale é o número lançado, editável à vontade.
   */
  suggestedChildren?: number | null;
  onSaved: (counts: AttendanceCounts) => void;
}

/**
 * Contagem de público do culto. Qualquer escalado no ministério responsável
 * pode lançar; quem fecha a conta (permissão, dia do culto, culto cancelado) é
 * a API, e a mensagem dela chega aqui.
 */
export function AttendanceFormModal({
  open,
  onOpenChange,
  instanceId,
  subtitle,
  initial,
  suggestedChildren = null,
  onSaved,
}: AttendanceFormModalProps) {
  const suggested = suggestedChildren !== null && suggestedChildren > 0 ? suggestedChildren : null;
  const [values, setValues] = useState<Record<Field, string>>({
    children: initial ? String(initial.children) : suggested !== null ? String(suggested) : "",
    members: initial ? String(initial.members) : "",
    attendees: initial ? String(initial.attendees) : "",
    visitors: initial ? String(initial.visitors) : "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = FIELDS.map((f) => parse(values[f.key]));
  const valid = parsed.every((n) => n !== null);
  const total = parsed.reduce<number>((sum, n) => sum + (n ?? 0), 0);

  async function save() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put<AttendanceCounts>(
        `/celebrations/instances/${instanceId}/attendance`,
        {
          children: parsed[0],
          members: parsed[1],
          attendees: parsed[2],
          visitors: parsed[3],
        },
      );
      onSaved(data);
      onOpenChange(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Não foi possível salvar a contagem."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Contagem do culto" description={subtitle}>
      <div className="flex flex-col gap-3">
        {FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <Label htmlFor={`att-${f.key}`} className="text-sm font-medium text-ink dark:text-white">
              {f.label}
            </Label>
            <Input
              id={`att-${f.key}`}
              inputMode="numeric"
              autoComplete="off"
              value={values[f.key]}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              disabled={busy}
              aria-describedby={`att-${f.key}-hint`}
              className="rounded-[8px] font-mono"
            />
            <span id={`att-${f.key}-hint`} className="text-xs text-stone">
              {f.hint}
            </span>
            {f.key === "children" && suggested !== null ? (
              <span className="flex items-center gap-2 text-xs text-stone">
                <span>
                  Check-in do Kids: {suggested} {suggested === 1 ? "criança" : "crianças"}
                </span>
                {values.children !== String(suggested) ? (
                  <button
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, children: String(suggested) }))}
                    disabled={busy}
                    className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 font-medium text-ink outline-none hover:border-teal hover:text-teal focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-white"
                  >
                    Usar {suggested}
                  </button>
                ) : null}
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-[var(--border-default)] pt-3">
        <span className="text-sm text-stone">Total</span>
        <span className="font-mono text-xl font-medium text-ink dark:text-white" data-testid="attendance-total">
          {total}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-crimson">
          {error}
        </p>
      ) : null}
      {!valid && Object.values(values).some((v) => v !== "") ? (
        <p className="mt-3 text-xs text-stone">
          Preencha as quatro categorias com números inteiros de 0 a {MAX.toLocaleString("pt-BR")}. Use 0 quando
          não houve ninguém.
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
        >
          Voltar
        </button>
        <Button
          type="button"
          onClick={save}
          disabled={busy || !valid}
          className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Salvar contagem
        </Button>
      </div>
    </Modal>
  );
}
