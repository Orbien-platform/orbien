"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  role: string;
  person: { id: string; full_name: string };
}

interface RegisterMeetingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  members: Member[];
  onRegistered: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RegisterMeetingModal({
  open,
  onOpenChange,
  groupId,
  groupName,
  members,
  onRegistered,
}: RegisterMeetingModalProps) {
  const [step, setStep] = useState<"form" | "attendance" | "done">("form");
  const [occurredAt, setOccurredAt] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [topic, setTopic] = useState("");
  const [observations, setObservations] = useState("");
  const [meetingId, setMeetingId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [attendance, setAttendance] = useState<Record<string, boolean>>({});
  const [savingAttendance, setSavingAttendance] = useState<Record<string, boolean>>({});

  // Initialize attendance map when members change
  useEffect(() => {
    const init: Record<string, boolean> = {};
    for (const m of members) init[m.person.id] = false;
    setAttendance(init);
  }, [members]);

  function reset() {
    setStep("form");
    setOccurredAt(new Date().toISOString().split("T")[0]);
    setTopic("");
    setObservations("");
    setMeetingId("");
    setError("");
    setAttendance({});
    setSavingAttendance({});
  }

  async function handleCreateMeeting(e: FormEvent) {
    e.preventDefault();
    if (!occurredAt) { setError("Data é obrigatória."); return; }
    setError("");
    setIsSubmitting(true);
    try {
      const { data } = await api.post<{ id: string }>(
        `/small-groups/${groupId}/meetings`,
        {
          occurred_at: new Date(occurredAt + "T12:00:00").toISOString(),
          topic: topic.trim() || undefined,
          observations: observations.trim() || undefined,
        }
      );
      setMeetingId(data.id);
      setStep("attendance");
    } catch (err: unknown) {
      // Endpoint may not be available in local dev (Railway-only)
      const status = (err as { response?: { status: number } })?.response?.status;
      if (status === 404) {
        setError("Reuniões ainda não disponíveis neste ambiente. Tente em produção.");
      } else {
        setError("Erro ao registrar reunião.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleAttendance(personId: string) {
    if (!meetingId) return;
    const newVal = !attendance[personId];
    setAttendance((prev) => ({ ...prev, [personId]: newVal }));
    setSavingAttendance((prev) => ({ ...prev, [personId]: true }));
    try {
      await api.post(`/small-groups/meetings/${meetingId}/attendance`, {
        person_id: personId,
        present: newVal,
      });
    } catch {
      // Revert on error
      setAttendance((prev) => ({ ...prev, [personId]: !newVal }));
    } finally {
      setSavingAttendance((prev) => ({ ...prev, [personId]: false }));
    }
  }

  const presentCount = Object.values(attendance).filter(Boolean).length;
  const totalCount = members.length;

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Registrar reunião"
      description={step === "form" ? groupName : `Presença — ${groupName}`}
      className="max-w-md"
    >
      {/* ── Step 1: Meeting form ── */}
      {step === "form" && (
        <form onSubmit={handleCreateMeeting} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rm-date" className="text-sm font-medium text-ink dark:text-white">
              Data <span className="text-crimson">*</span>
            </Label>
            <Input
              id="rm-date"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rm-topic" className="text-sm font-medium text-ink dark:text-white">
              Tema / estudo
            </Label>
            <Input
              id="rm-topic"
              placeholder="ex: Estudo de Romanos 8"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isSubmitting}
              className="rounded-[8px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rm-obs" className="text-sm font-medium text-ink dark:text-white">
              Observações <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>
            <textarea
              id="rm-obs"
              rows={2}
              placeholder="Notas sobre a reunião…"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
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
              {isSubmitting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                "Registrar e marcar presença"
              )}
            </Button>
          </div>
        </form>
      )}

      {/* ── Step 2: Attendance ── */}
      {step === "attendance" && (
        <div className="flex flex-col gap-4">
          {/* Counter */}
          <div className="flex items-center justify-between rounded-[8px] bg-[var(--surface-subtle)] px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-stone">
              <Users size={14} strokeWidth={1.5} />
              Presença
            </div>
            <span className="text-sm font-medium text-ink dark:text-white">
              {presentCount}/{totalCount} presentes
            </span>
          </div>

          {members.length === 0 ? (
            <p className="py-4 text-center text-sm text-stone">
              Nenhum membro cadastrado neste grupo.
            </p>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1">
              {members.map((m) => {
                const personId = m.person.id;
                const isPresent = attendance[personId] ?? false;
                const isSaving = savingAttendance[personId] ?? false;
                const initials = m.person.full_name
                  .split(" ")
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
                  .toUpperCase();

                return (
                  <button
                    key={personId}
                    type="button"
                    onClick={() => !isSaving && toggleAttendance(personId)}
                    disabled={isSaving}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left transition-colors",
                      isPresent
                        ? "bg-teal-dim"
                        : "hover:bg-[var(--surface-subtle)]"
                    )}
                  >
                    {/* Avatar */}
                    <div
                      className={cn(
                        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium",
                        isPresent ? "bg-teal text-white" : "bg-[var(--surface-subtle)] text-stone"
                      )}
                    >
                      {isSaving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        initials
                      )}
                    </div>
                    <span className="flex-1 text-sm text-ink dark:text-white">
                      {m.person.full_name}
                    </span>
                    {/* Checkbox visual */}
                    <div
                      className={cn(
                        "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 transition-colors",
                        isPresent
                          ? "border-teal bg-teal text-white"
                          : "border-[var(--border-default)] bg-[var(--surface-base)]"
                      )}
                    >
                      {isPresent && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <Button
            type="button"
            onClick={() => { onRegistered(); onOpenChange(false); reset(); }}
            className="w-full rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
          >
            Finalizar
          </Button>
        </div>
      )}
    </Modal>
  );
}
