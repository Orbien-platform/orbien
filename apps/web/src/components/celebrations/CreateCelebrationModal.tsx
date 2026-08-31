"use client";

import { useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Recurrence = "weekly" | "biweekly" | "monthly" | "none";

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
  none: "Não recorrente",
};

export type CelebrationType = "sunday_service" | "midweek" | "special_event";

export const CELEBRATION_TYPE_LABELS: Record<CelebrationType, string> = {
  sunday_service: "Culto Dominical",
  midweek: "Culto de Semana",
  special_event: "Evento Especial",
};

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

const DAYS = WEEKDAY_LABELS;

interface CreateCelebrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateCelebrationModal({
  open,
  onOpenChange,
  onCreated,
}: CreateCelebrationModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CelebrationType>("sunday_service");
  const [dayOfWeek, setDayOfWeek] = useState("");
  const [startTime, setStartTime] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("weekly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function reset() {
    setName("");
    setType("sunday_service");
    setDayOfWeek("");
    setStartTime("");
    setRecurrence("weekly");
    setError("");
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome é obrigatório."); return; }
    if (!startTime) { setError("Horário é obrigatório."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post("/celebrations", {
        name: name.trim(),
        type,
        day_of_week: dayOfWeek !== "" ? Number(dayOfWeek) : undefined,
        start_time: startTime,
        recurrence,
      });
      setSuccess(true);
      setTimeout(() => { onCreated(); onOpenChange(false); reset(); }, 1200);
    } catch {
      setError("Erro ao criar celebração. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Nova celebração"
      className="max-w-md"
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={40} className="text-teal" strokeWidth={1.5} />
          <p className="text-sm font-medium text-ink dark:text-white">
            Celebração criada com sucesso!
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cc-name" className="text-sm font-medium text-ink dark:text-white">
              Nome <span className="text-crimson">*</span>
            </Label>
            <Input
              id="cc-name"
              placeholder="ex: Culto Dominical Manhã"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          {/* Tipo */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cc-type" className="text-sm font-medium text-ink dark:text-white">
              Tipo <span className="text-crimson">*</span>
            </Label>
            <select
              id="cc-type"
              value={type}
              onChange={(e) => setType(e.target.value as CelebrationType)}
              disabled={isSubmitting}
              className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
            >
              {(Object.entries(CELEBRATION_TYPE_LABELS) as [CelebrationType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {/* Dia e Horário */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-day" className="text-sm font-medium text-ink dark:text-white">
                Dia da semana
              </Label>
              <select
                id="cc-day"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                disabled={isSubmitting}
                className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
              >
                <option value="">— Dia —</option>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-time" className="text-sm font-medium text-ink dark:text-white">
                Horário <span className="text-crimson">*</span>
              </Label>
              <Input
                id="cc-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            </div>
          </div>

          {/* Recorrência */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cc-rec" className="text-sm font-medium text-ink dark:text-white">
              Recorrência
            </Label>
            <select
              id="cc-rec"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              disabled={isSubmitting}
              className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
            >
              {(Object.entries(RECURRENCE_LABELS) as [Recurrence, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson" role="alert">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-[8px]"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
            >
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Criar celebração"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
