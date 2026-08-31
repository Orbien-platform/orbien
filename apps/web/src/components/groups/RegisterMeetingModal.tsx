"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Users, FileText, X } from "lucide-react";
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

interface StudyMaterialOption {
  id: string;
  title: string;
  author?: string;
}

type MaterialVisibility = "all" | "leaders_only";

interface MeetingMaterial {
  id: string;
  material_id: string;
  visibility: MaterialVisibility;
  material: { id: string; title: string; author?: string; source_type?: string; rich_content?: string };
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

  // Materials
  const [materialMode, setMaterialMode] = useState<"existing" | "link">("existing");
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialResults, setMaterialResults] = useState<StudyMaterialOption[]>([]);
  const [searchingMaterials, setSearchingMaterials] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<StudyMaterialOption | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [materialVisibility, setMaterialVisibility] = useState<MaterialVisibility>("all");
  const [isAddingMaterial, setIsAddingMaterial] = useState(false);
  const [materialError, setMaterialError] = useState("");
  const [meetingMaterials, setMeetingMaterials] = useState<MeetingMaterial[]>([]);
  const [removingMaterialId, setRemovingMaterialId] = useState<string | null>(null);

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
    setMaterialMode("existing");
    setMaterialSearch("");
    setMaterialResults([]);
    setSelectedMaterial(null);
    setLinkUrl("");
    setLinkTitle("");
    setMaterialVisibility("all");
    setMaterialError("");
    setMeetingMaterials([]);
    setRemovingMaterialId(null);
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

  async function handleMaterialSearch(term: string) {
    setMaterialSearch(term);
    setSelectedMaterial(null);
    if (!term.trim()) { setMaterialResults([]); return; }
    setSearchingMaterials(true);
    try {
      const { data } = await api.get<{ data: StudyMaterialOption[] }>("/study-materials", {
        params: { search: term, limit: 8 },
      });
      setMaterialResults(data.data ?? []);
    } catch {
      setMaterialResults([]);
    } finally {
      setSearchingMaterials(false);
    }
  }

  function selectMaterial(opt: StudyMaterialOption) {
    setSelectedMaterial(opt);
    setMaterialResults([]);
    setMaterialSearch(opt.title);
  }

  async function handleAddMaterial() {
    if (!meetingId) return;
    setMaterialError("");

    if (materialMode === "link") {
      if (!linkTitle.trim() || !linkUrl.trim()) {
        setMaterialError("Informe título e link do material.");
        return;
      }
    } else if (!selectedMaterial) {
      setMaterialError("Selecione um material.");
      return;
    }

    setIsAddingMaterial(true);
    try {
      let materialId = selectedMaterial?.id;
      let materialInfo: MeetingMaterial["material"] = selectedMaterial
        ? { id: selectedMaterial.id, title: selectedMaterial.title, author: selectedMaterial.author }
        : { id: "", title: linkTitle.trim() };

      if (materialMode === "link") {
        // StudyMaterial has no dedicated "link" type — a rich_text material
        // whose content is the URL is the closest fit the API supports.
        const { data: created } = await api.post<{ id: string }>("/study-materials", {
          title: linkTitle.trim(),
          source_type: "rich_text",
          rich_content: linkUrl.trim(),
          publish_at: new Date().toISOString(),
          target_group_ids: [groupId],
        });
        materialId = created.id;
        materialInfo = { id: created.id, title: linkTitle.trim(), source_type: "rich_text", rich_content: linkUrl.trim() };
      }

      const { data: linked } = await api.post<{ id: string }>(
        `/small-groups/meetings/${meetingId}/materials`,
        { material_id: materialId, visibility: materialVisibility }
      );

      setMeetingMaterials((prev) => [
        ...prev,
        {
          id: linked.id,
          material_id: materialId!,
          visibility: materialVisibility,
          material: materialInfo,
        },
      ]);
      setSelectedMaterial(null);
      setMaterialSearch("");
      setLinkUrl("");
      setLinkTitle("");
      setMaterialVisibility("all");
    } catch (err: unknown) {
      const status = (err as { response?: { status: number } })?.response?.status;
      setMaterialError(
        status === 409 ? "Este material já está vinculado a esta reunião." : "Erro ao adicionar material."
      );
    } finally {
      setIsAddingMaterial(false);
    }
  }

  async function handleRemoveMaterial(item: MeetingMaterial) {
    if (!meetingId) return;
    setRemovingMaterialId(item.id);
    try {
      await api.delete(`/small-groups/meetings/${meetingId}/materials/${item.material_id}`);
      setMeetingMaterials((prev) => prev.filter((m) => m.id !== item.id));
    } catch {
      setMaterialError("Erro ao remover material.");
    } finally {
      setRemovingMaterialId(null);
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
      className="max-w-md max-h-[88vh] overflow-y-auto"
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

          {/* Materials */}
          <div className="flex flex-col gap-3 border-t border-[var(--border-default)] pt-4">
            <Label className="text-sm font-medium text-ink dark:text-white">
              Material do encontro <span className="text-xs font-normal text-stone">(opcional)</span>
            </Label>

            <div className="flex gap-1 rounded-[8px] bg-[var(--surface-subtle)] p-1">
              <button
                type="button"
                onClick={() => setMaterialMode("existing")}
                className={cn(
                  "flex-1 rounded-[6px] px-2 py-1.5 text-xs font-medium transition-colors",
                  materialMode === "existing"
                    ? "bg-[var(--surface-base)] text-ink shadow-sm dark:text-white"
                    : "text-stone hover:text-ink dark:hover:text-white"
                )}
              >
                Vincular material existente
              </button>
              <button
                type="button"
                onClick={() => setMaterialMode("link")}
                className={cn(
                  "flex-1 rounded-[6px] px-2 py-1.5 text-xs font-medium transition-colors",
                  materialMode === "link"
                    ? "bg-[var(--surface-base)] text-ink shadow-sm dark:text-white"
                    : "text-stone hover:text-ink dark:hover:text-white"
                )}
              >
                Informar link externo
              </button>
            </div>

            {materialMode === "existing" ? (
              <div className="flex flex-col gap-1.5">
                <div className="relative">
                  <Input
                    placeholder="Buscar material por título…"
                    value={materialSearch}
                    onChange={(e) => handleMaterialSearch(e.target.value)}
                    disabled={isAddingMaterial}
                    className="rounded-[8px]"
                  />
                  {searchingMaterials && (
                    <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-stone" />
                  )}
                </div>
                {materialResults.length > 0 && !selectedMaterial && (
                  <div className="max-h-[150px] overflow-y-auto rounded-[8px] border border-[var(--border-default)]">
                    {materialResults.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => selectMaterial(m)}
                        className="flex w-full flex-col gap-0 border-b border-[var(--border-default)] px-3 py-2 text-left last:border-0 hover:bg-[var(--surface-subtle)]"
                      >
                        <span className="text-sm text-ink dark:text-white">{m.title}</span>
                        {m.author && <span className="text-xs text-stone">{m.author}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {selectedMaterial && (
                  <div className="flex items-center justify-between gap-2 rounded-[8px] bg-teal-dim px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-sm text-ink dark:text-white">{selectedMaterial.title}</span>
                      {selectedMaterial.author && (
                        <span className="text-xs text-stone">{selectedMaterial.author}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedMaterial(null); setMaterialSearch(""); }}
                      className="text-stone hover:text-ink"
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Título do material"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  disabled={isAddingMaterial}
                  className="rounded-[8px]"
                />
                <Input
                  type="url"
                  placeholder="https://…"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  disabled={isAddingMaterial}
                  className="rounded-[8px]"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
                <input
                  type="radio"
                  name="material-visibility"
                  checked={materialVisibility === "all"}
                  onChange={() => setMaterialVisibility("all")}
                  disabled={isAddingMaterial}
                />
                Disponível para todos os membros
              </label>
              <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
                <input
                  type="radio"
                  name="material-visibility"
                  checked={materialVisibility === "leaders_only"}
                  onChange={() => setMaterialVisibility("leaders_only")}
                  disabled={isAddingMaterial}
                />
                Somente para líderes
              </label>
            </div>

            {materialError && (
              <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson" role="alert">
                {materialError}
              </p>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={handleAddMaterial}
              disabled={isAddingMaterial}
              className="rounded-[8px]"
            >
              {isAddingMaterial ? <Loader2 size={14} className="animate-spin" /> : "Adicionar material"}
            </Button>

            {meetingMaterials.length > 0 && (
              <div className="flex flex-col gap-1">
                {meetingMaterials.map((mm) => (
                  <div
                    key={mm.id}
                    className="flex items-center justify-between gap-2 rounded-[8px] bg-[var(--surface-subtle)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText size={14} strokeWidth={1.5} className="flex-shrink-0 text-stone" />
                      <span className="truncate text-sm text-ink dark:text-white">{mm.material.title}</span>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded-[100px] px-2 py-0.5 text-xs font-medium",
                          mm.visibility === "all" ? "bg-teal-dim text-teal" : "bg-amber-100 text-amber-700"
                        )}
                      >
                        {mm.visibility === "all" ? "Todos" : "Somente líderes"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(mm)}
                        disabled={removingMaterialId === mm.id}
                        className="text-stone hover:text-crimson"
                        aria-label="Remover material"
                      >
                        {removingMaterialId === mm.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <X size={14} strokeWidth={1.5} />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
