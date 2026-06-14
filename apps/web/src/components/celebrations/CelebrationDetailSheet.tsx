"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, FileText, Calendar } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ServiceOrderView } from "@/components/celebrations/ServiceOrderView";
import { RECURRENCE_LABELS } from "@/components/celebrations/CreateCelebrationModal";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Celebration {
  id: string;
  name: string;
  day_of_week?: string;
  time?: string;
  recurrence?: string;
  description?: string;
}

interface CelebrationInstance {
  id: string;
  date: string;
  status?: string;
  service_order?: { id: string } | null;
}

interface InstancesResponse {
  data: CelebrationInstance[];
  total?: number;
}

interface CelebrationDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  celebrationId: string | null;
  canEdit: boolean;
  canAddSongs: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
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
  canAddSongs,
}: CelebrationDetailSheetProps) {
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [instances, setInstances] = useState<CelebrationInstance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [soViewOpen, setSoViewOpen] = useState(false);
  const hasFetched = useRef(false);

  const loadData = useCallback(async (id: string) => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    setIsLoading(true);
    try {
      const [celRes, instRes] = await Promise.allSettled([
        api.get<Celebration>(`/celebrations/${id}`),
        api.get<InstancesResponse | CelebrationInstance[]>(
          `/celebrations/${id}/instances?limit=10&sort=date&order=desc`
        ),
      ]);
      if (celRes.status === "fulfilled") setCelebration(celRes.value.data);
      if (instRes.status === "fulfilled") {
        const d = instRes.value.data;
        setInstances(Array.isArray(d) ? d : d.data ?? []);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && celebrationId) {
      hasFetched.current = false;
      setCelebration(null);
      setInstances([]);
      loadData(celebrationId);
    }
  }, [open, celebrationId, loadData]);

  function openInstance(instanceId: string) {
    setSelectedInstanceId(instanceId);
    setSoViewOpen(true);
  }

  const recLabel = celebration?.recurrence
    ? (RECURRENCE_LABELS[celebration.recurrence as keyof typeof RECURRENCE_LABELS] ?? celebration.recurrence)
    : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-[440px] overflow-y-auto p-0">
          {isLoading || !celebration ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 size={24} className="animate-spin text-stone" />
            </div>
          ) : (
            <div className="flex flex-col h-full">
              {/* Header */}
              <SheetHeader className="px-4 pt-6 pb-4 border-b border-[var(--border-default)]">
                <SheetTitle className="text-base font-medium text-ink dark:text-white pr-8">
                  {celebration.name}
                </SheetTitle>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {celebration.day_of_week && (
                    <span className="text-xs text-stone">{celebration.day_of_week}</span>
                  )}
                  {celebration.time && (
                    <span className="text-xs text-stone">{celebration.time}</span>
                  )}
                  {recLabel && (
                    <span className="text-xs text-stone">{recLabel}</span>
                  )}
                </div>
                {celebration.description && (
                  <SheetDescription className="mt-1 text-xs text-stone">
                    {celebration.description}
                  </SheetDescription>
                )}
              </SheetHeader>

              {/* Instances list */}
              <div className="flex flex-col flex-1 overflow-y-auto">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)]">
                  <Calendar size={14} strokeWidth={1.5} className="text-stone" />
                  <span className="text-sm font-medium text-ink dark:text-white">
                    Instâncias ({instances.length})
                  </span>
                </div>

                {instances.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-stone text-center">
                    Nenhuma instância gerada.
                  </p>
                ) : (
                  instances.map((inst) => {
                    const hasOC = !!inst.service_order;
                    return (
                      <button
                        key={inst.id}
                        type="button"
                        onClick={() => openInstance(inst.id)}
                        className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-subtle)] last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <FileText size={14} strokeWidth={1.5} className="flex-shrink-0 text-stone" />
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-ink dark:text-white">
                              {fmtDate(inst.date)}
                            </span>
                            {inst.status && (
                              <span className="text-xs text-stone capitalize">{inst.status}</span>
                            )}
                          </div>
                        </div>
                        <span
                          className={cn(
                            "flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                            instanceStatusCls(hasOC)
                          )}
                        >
                          {hasOC ? "Com OC" : "Sem OC"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

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
