"use client";

import { useEffect, useState } from "react";
import { Loader2, FileText, Calendar, Trash2, Ban, RotateCcw } from "lucide-react";
import {
  DetailPage,
  DetailPageContent,
  DetailPageHeader,
  DetailPageTitle,
  DetailPageDescription,
} from "@/components/ui/detail-page";
import { ServiceOrderView } from "@/components/celebrations/ServiceOrderView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/Modal";
import {
  RECURRENCE_LABELS,
  CELEBRATION_TYPE_LABELS,
  WEEKDAY_LABELS,
  type CelebrationType,
} from "@/components/celebrations/CreateCelebrationModal";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCivilDate } from "@/lib/datetime";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Celebration {
  id: string;
  name: string;
  type: CelebrationType;
  day_of_week: number | null;
  start_time: string;
  recurrence?: string;
}

interface CelebrationInstance {
  id: string;
  scheduled_date: string;
  status?: string;
  serviceOrder?: { id: string } | null;
}

interface CelebrationDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  celebrationId: string | null;
  canEdit: boolean;
  /** Remover a celebração é mais restrito que editar: só quem a API deixa. */
  canRemove?: boolean;
  canAddSongs: boolean;
  /** Chamado depois de a celebração ser removida, para a lista recarregar. */
  onRemoved?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  finalized: "Finalizado",
  cancelled: "Cancelado",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return formatCivilDate(iso, {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function instanceStatusCls(hasOC: boolean): string {
  return hasOC
    ? "bg-teal-dim text-teal"
    : "bg-[var(--surface-subtle)] text-stone";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CelebrationDetailSheet({
  open,
  onOpenChange,
  celebrationId,
  canEdit,
  canRemove = false,
  canAddSongs,
  onRemoved,
}: CelebrationDetailSheetProps) {
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [instances, setInstances] = useState<CelebrationInstance[]>([]);
  // Carregamento é derivado: qual celebração já terminou de carregar. Evita
  // setState síncrono dentro do effect, que dispara renders em cascata.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [soViewOpen, setSoViewOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Ações sobre cultos: qual instância está sendo cancelada (confirmação), o
  // modal de "cancelar uma data" e o de remover a celebração.
  const [cancelTarget, setCancelTarget] = useState<CelebrationInstance | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [dateValue, setDateValue] = useState("");
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isLoading = open && celebrationId !== null && loadedFor !== celebrationId;

  // Cadeia de promises em vez de async/await: assim todo setState acontece
  // dentro de um callback, nunca de forma síncrona no corpo do effect.
  useEffect(() => {
    if (!open || !celebrationId) return;
    // Cancelamento evita que uma resposta antiga sobrescreva o estado quando
    // o usuário troca de celebração antes da anterior terminar.
    const signal = { cancelled: false };
    Promise.allSettled([
      api.get<Celebration>(`/celebrations/${celebrationId}`),
      api.get<CelebrationInstance[]>(`/celebrations/instances?celebration_id=${celebrationId}`),
    ])
      .then(([celRes, instRes]) => {
        if (signal.cancelled) return;
        // Falha na celebração deixa o estado nulo — o spinner permanece, como
        // antes, em vez de mostrar dados da celebração anterior.
        setCelebration(celRes.status === "fulfilled" ? celRes.value.data : null);
        if (instRes.status === "fulfilled") {
          const sorted = (instRes.value.data ?? []).sort(
            (a, b) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime()
          );
          setInstances(sorted.slice(0, 10));
        } else {
          setInstances([]);
        }
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedFor(celebrationId);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [open, celebrationId, reloadKey]);

  // Reset ao fechar acontece no handler, não em effect.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setCelebration(null);
      setInstances([]);
      setLoadedFor(null);
    }
    onOpenChange(next);
  }

  // Executa uma ação da API e, se der certo, recarrega as instâncias. O erro
  // fica no modal que disparou, dito pelo servidor (ex.: "não cai no dia da semana").
  async function run(action: () => Promise<unknown>, fallback: string, after: () => void) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      after();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setActionError(apiErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  function setInstanceStatus(inst: CelebrationInstance, status: "cancelled" | "draft") {
    return run(
      () => api.patch(`/celebrations/instances/${inst.id}`, { status }),
      status === "cancelled" ? "Não foi possível cancelar o culto." : "Não foi possível reabrir o culto.",
      () => setCancelTarget(null),
    );
  }

  function cancelDate() {
    return run(
      () => api.post(`/celebrations/${celebrationId}/instances/cancel`, { dates: [dateValue] }),
      "Não foi possível cancelar essa data.",
      () => {
        setDateOpen(false);
        setDateValue("");
      },
    );
  }

  function removeCelebration() {
    return run(
      () => api.delete(`/celebrations/${celebrationId}`),
      "Não foi possível remover a celebração.",
      () => {
        setRemoveOpen(false);
        handleOpenChange(false);
        onRemoved?.();
      },
    );
  }

  function openInstance(instanceId: string) {
    setSelectedInstanceId(instanceId);
    setSoViewOpen(true);
  }

  const isRecurring = !!celebration?.recurrence && celebration.recurrence !== "none";

  const recLabel = celebration?.recurrence
    ? (RECURRENCE_LABELS[celebration.recurrence as keyof typeof RECURRENCE_LABELS] ?? celebration.recurrence)
    : null;

  return (
    <>
      <DetailPage open={open} onOpenChange={handleOpenChange} backLabel="Voltar para celebrações">
        <DetailPageContent>
          {isLoading || !celebration ? (
            <div className="flex min-h-[16rem] items-center justify-center">
              <Loader2 size={24} className="animate-spin text-stone" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <DetailPageHeader className="px-4 pt-6 pb-4 border-b border-[var(--border-default)]">
                <DetailPageTitle className="text-base font-medium text-ink dark:text-white pr-8">
                  {celebration.name}
                </DetailPageTitle>
                <DetailPageDescription className="mt-1 text-xs text-stone">
                  {CELEBRATION_TYPE_LABELS[celebration.type] ?? celebration.type}
                </DetailPageDescription>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {celebration.day_of_week != null && (
                    <span className="text-xs text-stone">{WEEKDAY_LABELS[celebration.day_of_week]}</span>
                  )}
                  {celebration.start_time && (
                    <span className="text-xs text-stone">{celebration.start_time}</span>
                  )}
                  {recLabel && (
                    <span className="text-xs text-stone">{recLabel}</span>
                  )}
                </div>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setRemoveOpen(true);
                    }}
                    className="mt-3 flex items-center gap-1.5 rounded-[8px] px-2 py-1 -ml-2 text-xs text-crimson hover:bg-crimson-dim"
                  >
                    <Trash2 size={13} strokeWidth={1.5} />
                    Remover celebração
                  </button>
                )}
              </DetailPageHeader>

              {/* Instances list */}
              <div className="flex flex-col flex-1 overflow-y-auto">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)]">
                  <Calendar size={14} strokeWidth={1.5} className="text-stone" />
                  <span className="text-sm font-medium text-ink dark:text-white">
                    Instâncias ({instances.length})
                  </span>
                  {canEdit && isRecurring && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        setDateOpen(true);
                      }}
                      className="ml-auto flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-xs text-stone hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white"
                    >
                      <Ban size={13} strokeWidth={1.5} />
                      Cancelar uma data
                    </button>
                  )}
                </div>

                {instances.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-stone text-center">
                    Nenhuma instância gerada.
                  </p>
                ) : (
                  instances.map((inst) => {
                    const hasOC = !!inst.serviceOrder;
                    const cancelled = inst.status === "cancelled";
                    return (
                      <div
                        key={inst.id}
                        className="flex items-center border-b border-[var(--border-default)] last:border-0"
                      >
                        <button
                          type="button"
                          onClick={() => openInstance(inst.id)}
                          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)]"
                        >
                          <div className="flex items-center gap-3">
                            <FileText size={14} strokeWidth={1.5} className="flex-shrink-0 text-stone" />
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={cn(
                                  "text-sm text-ink dark:text-white",
                                  cancelled && "text-stone line-through dark:text-stone"
                                )}
                              >
                                {fmtDate(inst.scheduled_date)}
                              </span>
                              {inst.status && (
                                <span className="text-xs text-stone">
                                  {STATUS_LABELS[inst.status] ?? inst.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                              cancelled
                                ? "bg-crimson-dim text-crimson"
                                : instanceStatusCls(hasOC)
                            )}
                          >
                            {cancelled ? "Cancelado" : hasOC ? "Com OC" : "Sem OC"}
                          </span>
                        </button>
                        {canEdit && inst.status !== "finalized" && (
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              if (cancelled) void setInstanceStatus(inst, "draft");
                              else setCancelTarget(inst);
                            }}
                            disabled={busy}
                            aria-label={`${cancelled ? "Reabrir" : "Cancelar"} o culto de ${fmtDate(inst.scheduled_date)}`}
                            title={cancelled ? "Reabrir culto" : "Cancelar culto"}
                            className="mr-3 flex-shrink-0 rounded-[6px] p-1.5 text-stone hover:bg-[var(--surface-subtle)] hover:text-ink disabled:opacity-50 dark:hover:text-white"
                          >
                            {cancelled ? (
                              <RotateCcw size={14} strokeWidth={1.5} />
                            ) : (
                              <Ban size={14} strokeWidth={1.5} />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </DetailPageContent>
      </DetailPage>

      <Modal
        open={cancelTarget !== null}
        onOpenChange={(next) => !next && setCancelTarget(null)}
        title="Cancelar este culto?"
        description={cancelTarget ? fmtDate(cancelTarget.scheduled_date) : undefined}
      >
        <p className="text-sm text-stone">
          O culto sai da agenda e da escala dos voluntários. A celebração continua se repetindo nas
          outras datas, e dá para reabrir este culto depois.
        </p>
        {actionError ? <p className="mt-3 text-sm text-crimson">{actionError}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setCancelTarget(null)}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Voltar
          </button>
          <Button
            type="button"
            onClick={() => cancelTarget && setInstanceStatus(cancelTarget, "cancelled")}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Cancelar culto
          </Button>
        </div>
      </Modal>

      <Modal
        open={dateOpen}
        onOpenChange={setDateOpen}
        title="Cancelar uma data"
        description="Escolha o dia do culto que não vai acontecer. Vale também para datas que ainda não aparecem na lista."
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancel-date" className="text-xs">
            Data
          </Label>
          <Input
            id="cancel-date"
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
          />
        </div>
        {actionError ? <p className="mt-3 text-sm text-crimson">{actionError}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDateOpen(false)}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Voltar
          </button>
          <Button
            type="button"
            onClick={cancelDate}
            disabled={busy || !dateValue}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Cancelar data
          </Button>
        </div>
      </Modal>

      <Modal
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remover esta celebração?"
        description={celebration?.name}
      >
        <p className="text-sm text-stone">
          {isRecurring
            ? "Ela deixa de se repetir e os cultos que ainda não aconteceram são apagados, com a ordem de celebração e a escala de cada um."
            : "O culto que ainda não aconteceu é apagado, com a ordem de celebração e a escala."}{" "}
          Os cultos que já passaram continuam no histórico. Não dá para desfazer.
        </p>
        {actionError ? <p className="mt-3 text-sm text-crimson">{actionError}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setRemoveOpen(false)}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Manter
          </button>
          <Button
            type="button"
            onClick={removeCelebration}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[8px] bg-crimson px-3 py-1.5 text-sm text-white hover:bg-crimson/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Remover celebração
          </Button>
        </div>
      </Modal>

      <ServiceOrderView
        open={soViewOpen}
        onOpenChange={setSoViewOpen}
        instanceId={selectedInstanceId}
        canEdit={canEdit}
        canAddSongs={canAddSongs}
      />
    </>
  );
}
