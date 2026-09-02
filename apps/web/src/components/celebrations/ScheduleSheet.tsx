"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CalendarOff,
  Check,
  ChevronDown,
  Crown,
  LayoutTemplate,
  Loader2,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { flattenMinistryTree, type MinistryTreeNode } from "@/lib/ministryTree";
import type { ScheduleTemplate } from "@/components/celebrations/TemplatesPanel";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleStatus = "draft" | "published" | "archived";
type AssignmentStatus = "pending" | "confirmed" | "declined";

interface Assignment {
  id: string;
  status: AssignmentStatus;
  notified_at: string | null;
  responded_at: string | null;
  volunteer_profile_id: string;
  volunteerProfile: { id: string; person: { id: string; full_name: string } };
}

interface ScheduleMinistry {
  /** CelebrationMinistry.id — usado nas rotas de atribuição. */
  id: string;
  /** Ministry.id — usado para remover o ministério da escala e para disponibilidade. */
  ministry_id: string;
  slots: number;
  assigned_count: number;
  ministry: { id: string; name: string };
  assignments: Assignment[];
}

interface ScheduleDetail {
  id: string;
  status: ScheduleStatus;
  celebration_instance_id: string;
  ministries: ScheduleMinistry[];
}

interface AvailabilityRow {
  volunteer_profile_id: string;
  role: "leader" | "volunteer";
  person: { id: string; full_name: string };
  unavailable: boolean;
}

interface ScheduleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string | null;
  /** Nome da celebração, para o cabeçalho. */
  celebrationName: string;
  /** Data da instância em ISO — usada na consulta de disponibilidade. */
  scheduledDate: string;
  /** Chamado quando a escala muda, para a lista de instâncias refletir o novo estado. */
  onChanged?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === "string") {
    return err.response.data.message;
  }
  return fallback;
}

function isNotFound(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

const ASSIGNMENT_LABELS: Record<AssignmentStatus, string> = {
  pending: "Aguardando",
  confirmed: "Confirmado",
  declined: "Recusou",
};

const ASSIGNMENT_CLASSES: Record<AssignmentStatus, string> = {
  pending: "bg-[var(--surface-subtle)] text-stone",
  confirmed: "bg-teal-dim text-teal",
  declined: "bg-crimson-dim text-crimson",
};

function isoDay(iso: string): string {
  return iso.slice(0, 10);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleSheet({
  open,
  onOpenChange,
  instanceId,
  celebrationName,
  scheduledDate,
  onChanged,
}: ScheduleSheetProps) {
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [noSchedule, setNoSchedule] = useState(false);
  // Carregamento é derivado: qual instância já terminou de carregar. Evita
  // setState síncrono dentro do effect, que dispara renders em cascata.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Adição de ministério
  const [ministryTree, setMinistryTree] = useState<MinistryTreeNode[]>([]);
  const [addMinOpen, setAddMinOpen] = useState(false);
  const [pickedMinistry, setPickedMinistry] = useState("");
  const [pickedSlots, setPickedSlots] = useState("1");
  const [addingMinistry, setAddingMinistry] = useState(false);

  // Aplicar template
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [pickedTemplate, setPickedTemplate] = useState("");
  const [applying, setApplying] = useState(false);

  // Seleção de voluntários — por CelebrationMinistry.id
  const [openPicker, setOpenPicker] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [availLoading, setAvailLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // ── Carregamento ──────────────────────────────────────────────────────────
  // Cadeia de promises em vez de async/await: assim todo setState acontece
  // dentro de um callback, nunca de forma síncrona na chamada.
  const load = useCallback(
    (signal?: { cancelled: boolean }) =>
      api
        .get<ScheduleDetail>(`/celebrations/instances/${instanceId}/schedule`)
        .then(({ data }) => {
          if (signal?.cancelled) return;
          setSchedule(data);
          setNoSchedule(false);
          setError(null);
        })
        .catch((err: unknown) => {
          if (signal?.cancelled) return;
          if (isNotFound(err)) {
            // Instância sem escala ainda — estado inicial legítimo, não erro.
            setSchedule(null);
            setNoSchedule(true);
            setError(null);
          } else {
            setError(errMsg(err, "Não foi possível carregar a escala."));
          }
        })
        .finally(() => {
          if (!signal?.cancelled) setLoadedFor(instanceId);
        }),
    [instanceId]
  );

  useEffect(() => {
    if (!open || !instanceId) return;
    // Cancelamento evita que uma resposta antiga sobrescreva o estado quando
    // o usuário troca de instância antes da anterior terminar.
    const signal = { cancelled: false };
    load(signal);
    api
      .get<MinistryTreeNode[]>("/volunteers/ministries")
      .then(({ data }) => setMinistryTree(Array.isArray(data) ? data : []))
      .catch(() => setMinistryTree([]));
    api
      .get<ScheduleTemplate[]>("/celebrations/schedule-templates")
      .then(({ data }) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]));
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instanceId]);

  // Reset ao fechar acontece no handler, não em effect.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setSchedule(null);
      setNoSchedule(false);
      setLoadedFor(null);
      setError(null);
      setNotice(null);
      setAddMinOpen(false);
      setOpenPicker(null);
    }
    onOpenChange(next);
  }

  // ── Ações ─────────────────────────────────────────────────────────────────
  async function createSchedule() {
    if (!instanceId) return;
    setCreating(true);
    setError(null);
    try {
      await api.post(`/celebrations/instances/${instanceId}/schedule`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Não foi possível criar a escala."));
    } finally {
      setCreating(false);
    }
  }

  async function addMinistry() {
    if (!instanceId || !pickedMinistry) return;
    const slots = Number(pickedSlots);
    if (!Number.isInteger(slots) || slots < 1) {
      setError("Número de vagas precisa ser um inteiro maior que zero.");
      return;
    }
    setAddingMinistry(true);
    setError(null);
    try {
      await api.post(`/celebrations/instances/${instanceId}/schedule/ministries`, {
        ministry_id: pickedMinistry,
        slots,
      });
      setPickedMinistry("");
      setPickedSlots("1");
      setAddMinOpen(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Não foi possível adicionar o ministério."));
    } finally {
      setAddingMinistry(false);
    }
  }

  async function applyTemplate() {
    if (!instanceId || !pickedTemplate) return;
    setApplying(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/celebrations/instances/${instanceId}/schedule/apply-template`, {
        template_id: pickedTemplate,
      });
      // O endpoint só adiciona os ministérios que ainda não estão na escala,
      // então aplicar duas vezes não duplica nada.
      setPickedTemplate("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Não foi possível aplicar o template."));
    } finally {
      setApplying(false);
    }
  }

  // Atenção: esta rota recebe Ministry.id, não CelebrationMinistry.id.
  async function removeMinistry(ministryId: string) {
    if (!instanceId) return;
    setBusyId(ministryId);
    setError(null);
    try {
      await api.delete(
        `/celebrations/instances/${instanceId}/schedule/ministries/${ministryId}`
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Não foi possível remover o ministério."));
    } finally {
      setBusyId(null);
    }
  }

  async function togglePicker(cm: ScheduleMinistry) {
    if (openPicker === cm.id) {
      setOpenPicker(null);
      return;
    }
    setOpenPicker(cm.id);
    setAvailability([]);
    setAvailLoading(true);
    try {
      const { data } = await api.get<AvailabilityRow[]>(
        `/volunteers/ministries/${cm.ministry_id}/availability?date=${isoDay(scheduledDate)}`
      );
      setAvailability(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(errMsg(err, "Não foi possível carregar os voluntários do ministério."));
      setOpenPicker(null);
    } finally {
      setAvailLoading(false);
    }
  }

  // A rota de atribuição recebe CelebrationMinistry.id (o vínculo), não Ministry.id.
  async function assign(cm: ScheduleMinistry, profileId: string) {
    if (!instanceId) return;
    setBusyId(profileId);
    setError(null);
    setNotice(null);
    try {
      const { data } = await api.post<{
        overbooked?: boolean;
        unavailable_on_date?: boolean;
      }>(
        `/celebrations/instances/${instanceId}/schedule/ministries/${cm.id}/assignments`,
        { volunteer_profile_id: profileId }
      );
      // A API aceita a atribuição mas sinaliza estes dois casos — vale mostrar.
      const warnings: string[] = [];
      if (data?.overbooked) warnings.push("acima do número de vagas");
      if (data?.unavailable_on_date) warnings.push("voluntário marcou indisponibilidade nesta data");
      if (warnings.length > 0) setNotice(`Atribuído, mas ${warnings.join(" e ")}.`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Não foi possível atribuir o voluntário."));
    } finally {
      setBusyId(null);
    }
  }

  async function unassign(cm: ScheduleMinistry, assignmentId: string) {
    if (!instanceId) return;
    setBusyId(assignmentId);
    setError(null);
    try {
      await api.delete(
        `/celebrations/instances/${instanceId}/schedule/ministries/${cm.id}/assignments/${assignmentId}`
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Não foi possível remover a atribuição."));
    } finally {
      setBusyId(null);
    }
  }

  async function publish() {
    if (!instanceId) return;
    setPublishing(true);
    setError(null);
    setNotice(null);
    try {
      await api.patch(`/celebrations/instances/${instanceId}/schedule/publish`);
      setNotice(
        pendingToNotify > 0
          ? `Escala publicada. ${pendingToNotify} voluntário${pendingToNotify > 1 ? "s" : ""} notificado${pendingToNotify > 1 ? "s" : ""}.`
          : "Escala publicada."
      );
      await load();
      onChanged?.();
    } catch (err) {
      setError(errMsg(err, "Não foi possível publicar a escala."));
    } finally {
      setPublishing(false);
    }
  }

  // ── Derivações ────────────────────────────────────────────────────────────
  const ministries = schedule?.ministries ?? [];
  const alreadyAssigned = new Set(
    ministries.flatMap((m) => m.assignments.map((a) => `${m.id}:${a.volunteer_profile_id}`))
  );

  // Publicar só notifica quem está pendente e ainda não recebeu aviso. Publicar
  // de novo, depois de incluir gente numa escala já publicada, avisa os novos.
  const pendingToNotify = ministries
    .flatMap((m) => m.assignments)
    .filter((a) => a.status === "pending" && a.notified_at === null).length;

  const isLoading = open && instanceId !== null && loadedFor !== instanceId;
  const isPublished = schedule?.status === "published";
  const isArchived = schedule?.status === "archived";

  const ministryOptions = flattenMinistryTree(ministryTree).filter(
    (opt) => !ministries.some((m) => m.ministry_id === opt.id)
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto p-0">
        {/* pr-12: abre espaço para o botão de fechar do Sheet (absolute top-3 right-3) */}
        <SheetHeader className="border-b border-[var(--border-default)] p-5 pr-12">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">{celebrationName}</SheetTitle>
              <SheetDescription className="text-xs">
                Escala ·{" "}
                {new Date(scheduledDate).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </SheetDescription>
            </div>
            {schedule ? (
              <span
                className={cn(
                  "flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                  isPublished
                    ? "bg-teal-dim text-teal"
                    : isArchived
                      ? "bg-crimson-dim text-crimson"
                      : "bg-[var(--surface-subtle)] text-stone"
                )}
              >
                {isPublished ? "Publicada" : isArchived ? "Arquivada" : "Rascunho"}
              </span>
            ) : null}
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-5">
          {error ? (
            <div className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
              <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
              <p className="text-sm text-crimson">{error}</p>
            </div>
          ) : null}

          {notice ? (
            <div className="flex items-start gap-2 rounded-[8px] bg-navy-dim p-3">
              <Check size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-navy" />
              <p className="text-sm text-navy">{notice}</p>
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex flex-col gap-3">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-[12px]" />
              ))}
            </div>
          ) : noSchedule ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Users size={32} strokeWidth={1} className="text-stone" />
              <p className="text-sm text-stone">Esta celebração ainda não tem escala.</p>
              <Button
                type="button"
                onClick={createSchedule}
                disabled={creating}
                className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90"
              >
                {creating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} strokeWidth={1.5} />
                )}
                Criar escala
              </Button>
            </div>
          ) : schedule ? (
            <>
              {/* ── Ministérios ── */}
              {ministries.length === 0 ? (
                <p className="py-6 text-center text-sm text-stone">
                  Nenhum ministério na escala. Adicione o primeiro abaixo.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {ministries.map((cm) => {
                    const short = cm.assigned_count < cm.slots;
                    const over = cm.assigned_count > cm.slots;
                    const pickerOpen = openPicker === cm.id;

                    return (
                      <div
                        key={cm.id}
                        className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-medium text-ink dark:text-white">
                              {cm.ministry.name}
                            </span>
                            <span
                              className={cn(
                                "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                                over
                                  ? "bg-crimson-dim text-crimson"
                                  : short
                                    ? "bg-[var(--surface-subtle)] text-stone"
                                    : "bg-teal-dim text-teal"
                              )}
                            >
                              {cm.assigned_count}/{cm.slots}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeMinistry(cm.ministry_id)}
                            disabled={busyId === cm.ministry_id}
                            aria-label={`Remover ${cm.ministry.name} da escala`}
                            className="flex-shrink-0 rounded-[6px] p-1.5 text-stone hover:bg-crimson-dim hover:text-crimson"
                          >
                            {busyId === cm.ministry_id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} strokeWidth={1.5} />
                            )}
                          </button>
                        </div>

                        {/* Voluntários atribuídos */}
                        {cm.assignments.length > 0 ? (
                          <div className="mt-3 flex flex-col gap-1.5">
                            {cm.assignments.map((a) => (
                              <div
                                key={a.id}
                                className="flex items-center justify-between gap-2 rounded-[8px] bg-[var(--surface-subtle)] px-2.5 py-1.5"
                              >
                                <span className="truncate text-xs text-ink dark:text-white">
                                  {a.volunteerProfile.person.full_name}
                                </span>
                                <div className="flex flex-shrink-0 items-center gap-1.5">
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                      ASSIGNMENT_CLASSES[a.status]
                                    )}
                                  >
                                    {ASSIGNMENT_LABELS[a.status]}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => unassign(cm, a.id)}
                                    disabled={busyId === a.id}
                                    aria-label={`Remover ${a.volunteerProfile.person.full_name} da escala`}
                                    className="rounded-[6px] p-1 text-stone transition-colors hover:bg-crimson-dim hover:text-crimson disabled:opacity-50"
                                  >
                                    {busyId === a.id ? (
                                      <Loader2 size={11} className="animate-spin" />
                                    ) : (
                                      <X size={11} strokeWidth={1.5} />
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {/* Seletor de voluntários */}
                        <button
                          type="button"
                          onClick={() => togglePicker(cm)}
                          className="mt-3 flex items-center gap-1 text-xs text-navy hover:underline"
                        >
                          <UserPlus size={12} strokeWidth={1.5} />
                          Adicionar voluntário
                          <ChevronDown
                            size={12}
                            strokeWidth={1.5}
                            className={cn("transition-transform", pickerOpen && "rotate-180")}
                          />
                        </button>

                        {pickerOpen ? (
                          <div className="mt-2 rounded-[8px] border border-[var(--border-default)] p-2">
                            {availLoading ? (
                              <div className="flex justify-center py-3">
                                <Loader2 size={16} className="animate-spin text-stone" />
                              </div>
                            ) : availability.length === 0 ? (
                              <p className="py-3 text-center text-xs text-stone">
                                Nenhum voluntário vinculado a este ministério.
                              </p>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {availability.map((v) => {
                                  const taken = alreadyAssigned.has(
                                    `${cm.id}:${v.volunteer_profile_id}`
                                  );
                                  return (
                                    <button
                                      key={v.volunteer_profile_id}
                                      type="button"
                                      onClick={() => assign(cm, v.volunteer_profile_id)}
                                      disabled={taken || busyId === v.volunteer_profile_id}
                                      className={cn(
                                        "flex items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-left text-xs",
                                        taken
                                          ? "cursor-not-allowed opacity-45"
                                          : "hover:bg-[var(--surface-subtle)]"
                                      )}
                                    >
                                      <span className="flex min-w-0 items-center gap-1.5">
                                        {v.role === "leader" ? (
                                          <Crown
                                            size={11}
                                            strokeWidth={1.5}
                                            className="flex-shrink-0 text-stone"
                                          />
                                        ) : null}
                                        <span className="truncate text-ink dark:text-white">
                                          {v.person.full_name}
                                        </span>
                                      </span>
                                      <span className="flex flex-shrink-0 items-center gap-1.5">
                                        {v.unavailable ? (
                                          <span className="flex items-center gap-1 text-crimson">
                                            <CalendarOff size={11} strokeWidth={1.5} />
                                            indisponível
                                          </span>
                                        ) : null}
                                        {taken ? (
                                          <span className="text-stone">já escalado</span>
                                        ) : busyId === v.volunteer_profile_id ? (
                                          <Loader2 size={11} className="animate-spin" />
                                        ) : null}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Aplicar template ── */}
              {templates.length > 0 ? (
                <div className="flex items-end gap-2 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-subtle)] p-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Label htmlFor="sched-tpl" className="text-xs">
                      Aplicar template
                    </Label>
                    <select
                      id="sched-tpl"
                      value={pickedTemplate}
                      onChange={(e) => setPickedTemplate(e.target.value)}
                      disabled={applying}
                      className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                    >
                      <option value="">Selecione…</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.ministries.length})
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    onClick={applyTemplate}
                    disabled={applying || !pickedTemplate}
                    className="flex h-9 flex-shrink-0 items-center gap-1.5 rounded-[8px] bg-navy px-3 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
                  >
                    {applying ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <LayoutTemplate size={14} strokeWidth={1.5} />
                    )}
                    Aplicar
                  </Button>
                </div>
              ) : null}

              {/* ── Adicionar ministério ── */}
              {addMinOpen ? (
                <div className="flex flex-col gap-3 rounded-[12px] border border-dashed border-[var(--border-default)] p-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sched-min" className="text-xs">
                      Ministério
                    </Label>
                    <select
                      id="sched-min"
                      value={pickedMinistry}
                      onChange={(e) => setPickedMinistry(e.target.value)}
                      disabled={addingMinistry}
                      className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
                    >
                      <option value="">Selecione…</option>
                      {ministryOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {`${"  ".repeat(opt.depth)}${opt.depth > 0 ? "└ " : ""}${opt.name}`}
                        </option>
                      ))}
                    </select>
                    {ministryOptions.length === 0 ? (
                      <p className="text-xs text-stone">
                        Todos os ministérios já estão na escala.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="sched-slots" className="text-xs">
                      Vagas
                    </Label>
                    <Input
                      id="sched-slots"
                      type="number"
                      min={1}
                      value={pickedSlots}
                      onChange={(e) => setPickedSlots(e.target.value)}
                      disabled={addingMinistry}
                      className="h-9 w-24"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={addMinistry}
                      disabled={addingMinistry || !pickedMinistry}
                      className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
                    >
                      {addingMinistry ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Plus size={14} strokeWidth={1.5} />
                      )}
                      Adicionar
                    </Button>
                    <button
                      type="button"
                      onClick={() => setAddMinOpen(false)}
                      disabled={addingMinistry}
                      className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddMinOpen(true)}
                  className="flex items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-[var(--border-default)] py-3 text-sm text-stone hover:bg-[var(--surface-subtle)]"
                >
                  <Plus size={14} strokeWidth={1.5} />
                  Adicionar ministério
                </button>
              )}

              {/* ── Publicar ── */}
              {ministries.length > 0 && !isArchived ? (
                <div className="border-t border-[var(--border-default)] pt-4">
                  <Button
                    type="button"
                    onClick={publish}
                    disabled={publishing || (isPublished && pendingToNotify === 0)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-navy px-3 py-2 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
                  >
                    {publishing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} strokeWidth={1.5} />
                    )}
                    {isPublished
                      ? pendingToNotify > 0
                        ? `Notificar ${pendingToNotify} novo${pendingToNotify > 1 ? "s" : ""}`
                        : "Todos notificados"
                      : "Publicar escala"}
                  </Button>
                  <p className="mt-2 text-center text-xs text-stone">
                    {isPublished
                      ? "Publicar de novo notifica apenas quem ainda não recebeu aviso."
                      : "Publicar notifica os voluntários atribuídos."}
                  </p>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
