"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Plus, Wand2, Send, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleStatus = "draft" | "published" | "finalized";
type AssignmentStatus = "pending" | "confirmed" | "declined";

interface Assignment {
  id: string;
  status: AssignmentStatus;
  volunteer_profile: {
    id: string;
    person: { id: string; full_name: string };
  };
}

interface Slot {
  id: string;
  role_name: string;
  required_count: number;
  assignments: Assignment[];
}

interface ScheduleDetail {
  id: string;
  title: string;
  date: string;
  status: ScheduleStatus;
  confirmation_deadline?: string;
  ministry: { id: string; name: string; color?: string };
  slots: Slot[];
}

interface VolunteerProfile {
  id: string;
  person: { id: string; full_name: string };
}

interface ScheduleDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string | null;
  canManage: boolean;   // can add slots, assign, suggest
  canPublish: boolean;  // can publish
  onUpdated: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
}

function statusLabel(s: ScheduleStatus): string {
  return { draft: "Rascunho", published: "Publicada", finalized: "Finalizada" }[s] ?? s;
}

function statusCls(s: ScheduleStatus): string {
  return {
    draft: "bg-[var(--surface-subtle)] text-stone",
    published: "bg-teal-dim text-teal",
    finalized: "bg-navy-dim text-navy",
  }[s] ?? "";
}

function assignBadgeCls(s: AssignmentStatus): string {
  return {
    pending: "bg-[var(--surface-subtle)] text-stone",
    confirmed: "bg-teal-dim text-teal",
    declined: "bg-crimson-dim text-crimson",
  }[s] ?? "";
}

function assignBadgeLabel(s: AssignmentStatus): string {
  return { pending: "Pendente", confirmed: "Confirmado", declined: "Recusou" }[s] ?? s;
}

function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

// ─── Confirm publish dialog ────────────────────────────────────────────────────

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  isPublishing: boolean;
}

function PublishDialog({ open, onOpenChange, onConfirm, isPublishing }: PublishDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Publicar escala"
      className="max-w-sm"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-[8px] bg-[var(--surface-subtle)] px-3 py-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-stone" strokeWidth={1.5} />
          <p className="text-sm text-ink dark:text-white">
            Ao publicar, os voluntários serão notificados e os slots de rascunho não poderão mais ser editados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-[8px]" onClick={() => onOpenChange(false)} disabled={isPublishing}>
            Cancelar
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isPublishing}
            className="flex-1 rounded-[8px] bg-teal text-white hover:bg-teal/90"
          >
            {isPublishing ? <Loader2 size={15} className="animate-spin" /> : "Publicar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function ScheduleDetailSheet({
  open,
  onOpenChange,
  scheduleId,
  canManage,
  canPublish,
  onUpdated,
}: ScheduleDetailSheetProps) {
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Add slot form
  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [slotRole, setSlotRole] = useState("");
  const [slotCount, setSlotCount] = useState("1");
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  const [slotError, setSlotError] = useState("");

  // Assign volunteer
  const [assigningSlotId, setAssigningSlotId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<VolunteerProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");

  // Actions
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  const hasFetched = useRef(false);
  const profilesFetched = useRef(false);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  const loadSchedule = useCallback(async (id: string) => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    try {
      const { data } = await api.get<ScheduleDetail>(`/volunteers/schedules/${id}`);
      setSchedule(data);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && scheduleId) {
      hasFetched.current = false;
      profilesFetched.current = false;
      setSchedule(null);
      setAddSlotOpen(false);
      setAssigningSlotId(null);
      loadSchedule(scheduleId);
    }
  }, [open, scheduleId, loadSchedule]);

  // Load volunteer profiles when assigning
  async function openAssign(slotId: string) {
    setAssigningSlotId(slotId);
    setSelectedProfileId("");
    setAssignError("");
    if (!profilesFetched.current && schedule) {
      profilesFetched.current = true;
      try {
        const { data } = await api.get<{ data: VolunteerProfile[] } | VolunteerProfile[]>(
          `/volunteers/profiles?ministry_id=${schedule.ministry.id}&limit=100`
        );
        const list = Array.isArray(data) ? data : data.data ?? [];
        setProfiles(list);
      } catch {
        setProfiles([]);
      }
    }
  }

  // Add slot
  async function handleAddSlot(e: FormEvent) {
    e.preventDefault();
    if (!slotRole.trim()) { setSlotError("Função é obrigatória."); return; }
    const count = parseInt(slotCount, 10);
    if (!count || count < 1) { setSlotError("Quantidade deve ser ≥ 1."); return; }
    if (!scheduleId) return;
    setSlotError("");
    setIsAddingSlot(true);
    try {
      await api.post(`/volunteers/schedules/${scheduleId}/slots`, {
        role_name: slotRole.trim(),
        required_count: count,
      });
      hasFetched.current = false;
      await loadSchedule(scheduleId);
      setSlotRole("");
      setSlotCount("1");
      setAddSlotOpen(false);
    } catch {
      setSlotError("Erro ao adicionar slot.");
    } finally {
      setIsAddingSlot(false);
    }
  }

  // Assign volunteer
  async function handleAssign() {
    if (!selectedProfileId || !assigningSlotId || !scheduleId) return;
    setAssignError("");
    setIsAssigning(true);
    try {
      await api.post(`/volunteers/schedules/${scheduleId}/assignments`, {
        slot_id: assigningSlotId,
        volunteer_profile_id: selectedProfileId,
      });
      hasFetched.current = false;
      await loadSchedule(scheduleId);
      setAssigningSlotId(null);
    } catch {
      setAssignError("Erro ao atribuir voluntário.");
    } finally {
      setIsAssigning(false);
    }
  }

  // Auto-suggest
  async function handleSuggest() {
    if (!scheduleId) return;
    setIsSuggesting(true);
    try {
      const { data } = await api.post<{ assigned?: number; message?: string }>(
        `/volunteers/schedules/${scheduleId}/suggest`
      );
      hasFetched.current = false;
      await loadSchedule(scheduleId);
      const count = data.assigned ?? 0;
      showToast(count > 0 ? `${count} voluntário(s) sugerido(s) automaticamente.` : "Nenhum voluntário disponível para sugestão.");
    } catch {
      showToast("Erro ao executar sugestão automática.");
    } finally {
      setIsSuggesting(false);
    }
  }

  // Publish
  async function handlePublish() {
    if (!scheduleId) return;
    setIsPublishing(true);
    try {
      await api.post(`/volunteers/schedules/${scheduleId}/publish`);
      hasFetched.current = false;
      await loadSchedule(scheduleId);
      setPublishOpen(false);
      onUpdated();
      showToast("Escala publicada com sucesso!");
    } catch {
      showToast("Erro ao publicar escala.");
    } finally {
      setIsPublishing(false);
    }
  }

  const isDraft = schedule?.status === "draft";
  const dotColor = schedule?.ministry?.color ?? "#1E3A5F";

  // Profiles not yet assigned to the slot being edited
  function availableProfiles(slot: Slot): VolunteerProfile[] {
    const assignedIds = slot.assignments.map((a) => a.volunteer_profile.id);
    return profiles.filter((p) => !assignedIds.includes(p.id));
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[600px] overflow-y-auto p-0">
          {isLoading || !schedule ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={24} className="animate-spin text-stone" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <SheetHeader className="px-4 pt-6 pb-4 border-b border-[var(--border-default)]">
                <div className="flex items-start gap-3 pr-8">
                  <div
                    className="mt-1.5 h-3 w-3 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                  <div className="flex flex-col gap-1 flex-1">
                    <SheetTitle className="text-base font-medium text-ink dark:text-white leading-tight">
                      {schedule.title}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-stone">
                      {schedule.ministry?.name ?? "—"} · {fmtDate(schedule.date)}
                    </SheetDescription>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge className={statusCls(schedule.status)}>
                        {statusLabel(schedule.status)}
                      </Badge>
                      {schedule.confirmation_deadline && (
                        <span className="text-xs text-stone">
                          Prazo:{" "}
                          {new Date(schedule.confirmation_deadline).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                {(canManage || canPublish) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canManage && isDraft && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { setAddSlotOpen(true); setSlotRole(""); setSlotCount("1"); setSlotError(""); }}
                        className="flex items-center gap-1.5 rounded-[8px] text-xs"
                      >
                        <Plus size={13} strokeWidth={1.5} />
                        Slot
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSuggest}
                        disabled={isSuggesting}
                        className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] border-navy text-xs"
                      >
                        {isSuggesting ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Wand2 size={13} strokeWidth={1.5} />
                        )}
                        Sugestão automática
                      </Button>
                    )}
                    {canPublish && isDraft && (
                      <Button
                        type="button"
                        onClick={() => setPublishOpen(true)}
                        className="flex items-center gap-1.5 rounded-[8px] bg-teal text-white hover:bg-teal/90 text-xs"
                      >
                        <Send size={13} strokeWidth={1.5} />
                        Publicar escala
                      </Button>
                    )}
                  </div>
                )}

                {/* Inline add-slot form */}
                {addSlotOpen && (
                  <form
                    onSubmit={handleAddSlot}
                    className="mt-3 flex flex-col gap-3 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3"
                  >
                    <p className="text-xs font-medium text-ink dark:text-white">Novo slot</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Função (ex: Músico)"
                        value={slotRole}
                        onChange={(e) => setSlotRole(e.target.value)}
                        disabled={isAddingSlot}
                        className="flex-1 rounded-[8px] text-sm"
                      />
                      <Input
                        type="number"
                        min={1}
                        max={50}
                        value={slotCount}
                        onChange={(e) => setSlotCount(e.target.value)}
                        disabled={isAddingSlot}
                        className="w-20 rounded-[8px] text-sm"
                        placeholder="Qtd"
                      />
                    </div>
                    {slotError && <p className="text-xs text-crimson">{slotError}</p>}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 rounded-[8px] text-xs"
                        onClick={() => setAddSlotOpen(false)}
                        disabled={isAddingSlot}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="submit"
                        disabled={isAddingSlot}
                        className="flex-1 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-xs"
                      >
                        {isAddingSlot ? <Loader2 size={13} className="animate-spin" /> : "Adicionar"}
                      </Button>
                    </div>
                  </form>
                )}
              </SheetHeader>

              {/* Slots */}
              <div className="flex-1 overflow-y-auto">
                {schedule.slots.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-stone">
                    Nenhum slot adicionado.{" "}
                    {isDraft && canManage && "Use o botão \"+ Slot\" para começar."}
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-[var(--border-default)]">
                    {schedule.slots.map((slot) => {
                      const filled = slot.assignments.filter((a) => a.status !== "declined").length;
                      const isAssigningThis = assigningSlotId === slot.id;
                      const avail = availableProfiles(slot);
                      const isFull = filled >= slot.required_count;

                      return (
                        <div key={slot.id} className="flex flex-col gap-2 px-4 py-4">
                          {/* Slot header */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-ink dark:text-white">
                                {slot.role_name}
                              </span>
                              <span className={cn(
                                "text-xs font-medium",
                                isFull ? "text-teal" : "text-stone"
                              )}>
                                {filled}/{slot.required_count}
                              </span>
                            </div>
                            {isDraft && canManage && !isAssigningThis && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => openAssign(slot.id)}
                                className="flex items-center gap-1 rounded-[6px] px-2 py-1 text-xs"
                              >
                                <Plus size={11} strokeWidth={1.5} />
                                Atribuir
                              </Button>
                            )}
                          </div>

                          {/* Assignments */}
                          {slot.assignments.length > 0 && (
                            <div className="flex flex-col gap-1 pl-1">
                              {slot.assignments.map((a) => (
                                <div
                                  key={a.id}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <span className="text-xs text-ink dark:text-white">
                                    {a.volunteer_profile.person.full_name}
                                  </span>
                                  <Badge className={assignBadgeCls(a.status)}>
                                    {assignBadgeLabel(a.status)}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Inline assign form */}
                          {isAssigningThis && (
                            <div className="flex flex-col gap-2 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3">
                              <select
                                value={selectedProfileId}
                                onChange={(e) => setSelectedProfileId(e.target.value)}
                                disabled={isAssigning}
                                className="h-8 rounded-[6px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-xs text-ink focus:outline-none dark:text-white"
                              >
                                <option value="">— Voluntário —</option>
                                {avail.map((p) => (
                                  <option key={p.id} value={p.id}>{p.person.full_name}</option>
                                ))}
                              </select>
                              {assignError && <p className="text-xs text-crimson">{assignError}</p>}
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="flex-1 rounded-[6px] text-xs py-1"
                                  onClick={() => setAssigningSlotId(null)}
                                  disabled={isAssigning}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  type="button"
                                  onClick={handleAssign}
                                  disabled={isAssigning || !selectedProfileId}
                                  className="flex-1 rounded-[6px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-xs py-1"
                                >
                                  {isAssigning ? <Loader2 size={12} className="animate-spin" /> : "Atribuir"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Toast */}
              {toastMsg && (
                <div className="absolute bottom-4 left-4 right-4 rounded-[8px] bg-ink px-4 py-2.5 text-sm text-white shadow-lg dark:bg-[var(--surface-subtle)] dark:text-ink">
                  {toastMsg}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onConfirm={handlePublish}
        isPublishing={isPublishing}
      />
    </>
  );
}
