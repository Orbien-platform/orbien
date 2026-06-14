"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ItemType =
  | "worship"
  | "sermon"
  | "prayer"
  | "announcements"
  | "offering"
  | "other";

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  worship: "Louvor",
  sermon: "Pregação",
  prayer: "Oração",
  announcements: "Avisos",
  offering: "Oferta",
  other: "Outro",
};

interface Person {
  id: string;
  full_name: string;
}

interface AddItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string;
  nextPosition: number;
  onAdded: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddItemModal({
  open,
  onOpenChange,
  serviceOrderId,
  nextPosition,
  onAdded,
}: AddItemModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ItemType>("worship");
  const [duration, setDuration] = useState("");
  const [startTime, setStartTime] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [notes, setNotes] = useState("");
  const [persons, setPersons] = useState<Person[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const hasFetched = useRef(false);

  const loadPersons = useCallback(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    api
      .get<{ data: Person[] }>("/persons?limit=100")
      .then((r) => setPersons(r.data.data ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) loadPersons();
  }, [open, loadPersons]);

  function reset() {
    setName("");
    setType("worship");
    setDuration("");
    setStartTime("");
    setResponsibleId("");
    setNotes("");
    setError("");
    hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome da etapa é obrigatório."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      await api.post(`/celebrations/service-orders/${serviceOrderId}/items`, {
        name: name.trim(),
        type,
        duration_minutes: duration ? parseInt(duration, 10) : undefined,
        start_time: startTime || undefined,
        responsible_person_id: responsibleId || undefined,
        notes: notes.trim() || undefined,
        position: nextPosition,
      });
      onAdded();
      onOpenChange(false);
      reset();
    } catch {
      setError("Erro ao adicionar etapa.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Nova etapa"
      className="max-w-md"
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* Nome */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-name" className="text-sm font-medium text-ink dark:text-white">
            Nome da etapa <span className="text-crimson">*</span>
          </Label>
          <Input
            id="ai-name"
            placeholder="ex: Louvor de abertura"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            className="rounded-[8px]"
          />
        </div>

        {/* Tipo */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-type" className="text-sm font-medium text-ink dark:text-white">
            Tipo
          </Label>
          <select
            id="ai-type"
            value={type}
            onChange={(e) => setType(e.target.value as ItemType)}
            disabled={isSubmitting}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            {(Object.entries(ITEM_TYPE_LABELS) as [ItemType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Duração e Horário */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-duration" className="text-sm font-medium text-ink dark:text-white">
              Duração (min)
            </Label>
            <Input
              id="ai-duration"
              type="number"
              min={1}
              max={300}
              placeholder="ex: 20"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-time" className="text-sm font-medium text-ink dark:text-white">
              Horário
            </Label>
            <Input
              id="ai-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>
        </div>

        {/* Responsável */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-resp" className="text-sm font-medium text-ink dark:text-white">
            Responsável <span className="text-xs font-normal text-stone">(opcional)</span>
          </Label>
          <select
            id="ai-resp"
            value={responsibleId}
            onChange={(e) => setResponsibleId(e.target.value)}
            disabled={isSubmitting}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            <option value="">— Nenhum —</option>
            {persons.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </div>

        {/* Notas */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-notes" className="text-sm font-medium text-ink dark:text-white">
            Notas <span className="text-xs font-normal text-stone">(opcional)</span>
          </Label>
          <textarea
            id="ai-notes"
            rows={2}
            placeholder="Instruções, observações…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : "Adicionar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
