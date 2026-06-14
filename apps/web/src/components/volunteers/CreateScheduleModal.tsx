"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ministry {
  id: string;
  name: string;
}

interface CreateScheduleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMinistryId?: string;
  onCreated: (scheduleId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateScheduleModal({
  open,
  onOpenChange,
  defaultMinistryId,
  onCreated,
}: CreateScheduleModalProps) {
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [ministryId, setMinistryId] = useState(defaultMinistryId ?? "");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const hasFetched = useRef(false);

  const loadMinistries = useCallback(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<{ data: Ministry[] } | Ministry[]>("/volunteers/ministries?limit=100")
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : r.data.data ?? [];
        setMinistries(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      loadMinistries();
      setMinistryId(defaultMinistryId ?? "");
    }
  }, [open, defaultMinistryId, loadMinistries]);

  function reset() {
    setTitle("");
    setDate("");
    setDeadline("");
    setError("");
    hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ministryId) { setError("Selecione um ministério."); return; }
    if (!title.trim()) { setError("Título é obrigatório."); return; }
    if (!date) { setError("Data é obrigatória."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ id: string }>("/volunteers/schedules", {
        ministry_id: ministryId,
        title: title.trim(),
        date: new Date(date + "T12:00:00").toISOString(),
        confirmation_deadline: deadline
          ? new Date(deadline).toISOString()
          : undefined,
      });
      onCreated(data.id);
      onOpenChange(false);
      reset();
    } catch {
      setError("Erro ao criar escala. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Nova escala"
      description="Preencha os dados e adicione slots após criar."
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* Ministério */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-ministry" className="text-sm font-medium text-ink dark:text-white">
            Ministério <span className="text-crimson">*</span>
          </Label>
          <select
            id="cs-ministry"
            value={ministryId}
            onChange={(e) => setMinistryId(e.target.value)}
            disabled={isSubmitting}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            <option value="">— Selecione o ministério —</option>
            {ministries.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Título */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-title" className="text-sm font-medium text-ink dark:text-white">
            Título <span className="text-crimson">*</span>
          </Label>
          <Input
            id="cs-title"
            placeholder="ex: Culto Dominical 15/06"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[8px]"
          />
        </div>

        {/* Data */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-date" className="text-sm font-medium text-ink dark:text-white">
            Data <span className="text-crimson">*</span>
          </Label>
          <Input
            id="cs-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[8px]"
          />
        </div>

        {/* Prazo de confirmação */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-deadline" className="text-sm font-medium text-ink dark:text-white">
            Prazo de confirmação{" "}
            <span className="text-xs font-normal text-stone">(opcional)</span>
          </Label>
          <Input
            id="cs-deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[8px]"
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
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Criar escala"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
