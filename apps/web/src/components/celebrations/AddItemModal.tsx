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

export type ItemPhase = "before" | "during" | "after";

export const PHASE_LABELS: Record<ItemPhase, string> = {
  before: "Antes do culto",
  during: "Durante o culto",
  after: "Depois do culto",
};

interface Person {
  id: string;
  full_name: string;
}

interface MinistryNode {
  id: string;
  name: string;
  children?: MinistryNode[];
}

function flattenMinistries(nodes: MinistryNode[]): { id: string; name: string }[] {
  return nodes.flatMap((n) => [{ id: n.id, name: n.name }, ...flattenMinistries(n.children ?? [])]);
}

interface AddItemModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string;
  nextSequence: number;
  /** "HH:mm" de início da celebração — usado para converter o horário digitado em `start_offset_minutes`. */
  celebrationStartTime?: string;
  onAdded: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function timeToMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

// O backend guarda `start_offset_minutes` (minutos desde o início da celebração),
// não um horário de relógio — a UI continua pedindo "HH:mm" e converte aqui.
// Negativo é antes do início do culto.
export function computeStartOffsetMinutes(itemTime: string, celebrationStartTime?: string): number {
  const itemMinutes = timeToMinutes(itemTime);
  if (itemMinutes === null) return 0;
  const startMinutes = celebrationStartTime ? timeToMinutes(celebrationStartTime) : null;
  if (startMinutes === null) return 0;
  return itemMinutes - startMinutes;
}

/** Mensagem de erro quando o horário não combina com o momento; `null` se combina. */
export function phaseTimeError(phase: ItemPhase, offset: number): string | null {
  if (phase === "before" && offset >= 0) {
    return "Para uma etapa antes do culto, o horário precisa ser anterior ao início.";
  }
  if (phase !== "before" && offset < 0) {
    return "O horário está antes do início do culto. Escolha \"Antes do culto\" como momento.";
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddItemModal({
  open,
  onOpenChange,
  serviceOrderId,
  nextSequence,
  celebrationStartTime,
  onAdded,
}: AddItemModalProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ItemType>("worship");
  const [phase, setPhase] = useState<ItemPhase>("during");
  const [isTeamTask, setIsTeamTask] = useState(false);
  const [duration, setDuration] = useState("");
  const [startTime, setStartTime] = useState("");
  // "" | "person:<id>" | "ministry:<id>"
  const [responsible, setResponsible] = useState("");
  const [notes, setNotes] = useState("");
  const [persons, setPersons] = useState<Person[]>([]);
  const [ministries, setMinistries] = useState<{ id: string; name: string }[]>([]);
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
    // Ministérios são a ligação com a escala: quem está escalado neles
    // aparece ao lado da etapa.
    api
      .get<MinistryNode[]>("/volunteers/ministries")
      .then((r) => setMinistries(flattenMinistries(Array.isArray(r.data) ? r.data : [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (open) loadPersons();
  }, [open, loadPersons]);

  function reset() {
    setName("");
    setType("worship");
    setPhase("during");
    setIsTeamTask(false);
    setDuration("");
    setStartTime("");
    setResponsible("");
    setNotes("");
    setError("");
    hasFetched.current = false;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome da etapa é obrigatório."); return; }
    // Etapa de equipe pode ser um aviso pontual ("luz desligada às 10h05"),
    // sem duração; etapa do programa sempre tem.
    if (!isTeamTask && !duration.trim()) { setError("Duração é obrigatória."); return; }
    if (!startTime) { setError("Horário é obrigatório."); return; }
    const offset = computeStartOffsetMinutes(startTime, celebrationStartTime);
    const timeError = celebrationStartTime ? phaseTimeError(phase, offset) : null;
    if (timeError) { setError(timeError); return; }
    setError("");
    setIsSubmitting(true);
    try {
      const [kind, id] = responsible.split(":");
      await api.post(`/celebrations/items`, {
        service_order_id: serviceOrderId,
        sequence: nextSequence,
        name: name.trim(),
        type,
        phase,
        entry_kind: isTeamTask ? "logistics" : "program",
        duration_minutes: duration.trim() ? parseInt(duration, 10) : 0,
        start_offset_minutes: offset,
        responsible_type: kind === "ministry" ? "ministry" : kind === "person" ? "person" : "free_text",
        person_id: kind === "person" ? id : undefined,
        ministry_id: kind === "ministry" ? id : undefined,
        responsible_label: responsible ? undefined : "A definir",
        notes: notes.trim() || undefined,
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

        {/* Momento */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-phase" className="text-sm font-medium text-ink dark:text-white">
            Momento
          </Label>
          <select
            id="ai-phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value as ItemPhase)}
            disabled={isSubmitting}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            {(Object.entries(PHASE_LABELS) as [ItemPhase, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* Etapa de equipe */}
        <label className="flex items-start gap-2 text-sm text-ink dark:text-white">
          <input
            type="checkbox"
            checked={isTeamTask}
            onChange={(e) => setIsTeamTask(e.target.checked)}
            disabled={isSubmitting}
            className="mt-0.5"
          />
          <span>
            Etapa de equipe
            <span className="block text-xs text-stone">
              Tarefa da escala, como recepção pronta, estacionamento ou luz. Não ocupa tempo do programa.
            </span>
          </span>
        </label>

        {/* Duração e Horário */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ai-duration" className="text-sm font-medium text-ink dark:text-white">
              Duração (min) {isTeamTask ? <span className="text-xs font-normal text-stone">(opcional)</span> : <span className="text-crimson">*</span>}
            </Label>
            <Input
              id="ai-duration"
              type="number"
              min={isTeamTask ? 0 : 1}
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
              Horário <span className="text-crimson">*</span>
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
            value={responsible}
            onChange={(e) => setResponsible(e.target.value)}
            disabled={isSubmitting}
            className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          >
            <option value="">— Nenhum —</option>
            {ministries.length > 0 && (
              <optgroup label="Ministérios (quem está na escala)">
                {ministries.map((m) => (
                  <option key={m.id} value={`ministry:${m.id}`}>{m.name}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Pessoas">
              {persons.map((p) => (
                <option key={p.id} value={`person:${p.id}`}>{p.full_name}</option>
              ))}
            </optgroup>
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
