"use client";

import { useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Recurrence = "weekly" | "biweekly" | "monthly";

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  weekly: "Semanal",
  biweekly: "Quinzenal",
  monthly: "Mensal",
};

const DAYS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

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
  const [dayOfWeek, setDayOfWeek] = useState("");
  const [time, setTime] = useState("");
  const [recurrence, setRecurrence] = useState<Recurrence>("weekly");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function reset() {
    setName("");
    setDayOfWeek("");
    setTime("");
    setRecurrence("weekly");
    setDescription("");
    setError("");
    setSuccess(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome é obrigatório."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post("/celebrations", {
        name: name.trim(),
        day_of_week: dayOfWeek || undefined,
        time: time || undefined,
        recurrence,
        description: description.trim() || undefined,
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
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cc-time" className="text-sm font-medium text-ink dark:text-white">
                Horário
              </Label>
              <Input
                id="cc-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
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

          {/* Descrição */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cc-desc" className="text-sm font-medium text-ink dark:text-white">
              Descrição <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>
            <textarea
              id="cc-desc"
              rows={2}
              placeholder="Breve descrição da celebração…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-3 py-2 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white resize-none"
            />
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
