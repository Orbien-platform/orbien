"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, FileText, Calendar } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateCelebrationModal, RECURRENCE_LABELS, WEEKDAY_LABELS } from "@/components/celebrations/CreateCelebrationModal";
import { CelebrationDetailSheet } from "@/components/celebrations/CelebrationDetailSheet";
import { ServiceOrderView } from "@/components/celebrations/ServiceOrderView";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Celebration {
  id: string;
  name: string;
  day_of_week: number | null;
  start_time: string;
  recurrence: string;
}

interface CelebrationInstance {
  id: string;
  scheduled_date: string;
  status?: string;
  celebration: { id: string; name: string };
  serviceOrder?: { id: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function tabBtn(active: boolean) {
  return cn(
    "relative px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none",
    active
      ? "text-navy dark:text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-navy"
      : "text-stone hover:text-ink dark:hover:text-white"
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CelebracoesPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canEdit = roles.some((r) =>
    ["admin_congregation", "pastor", "tenant_admin"].includes(r)
  );
  const canView = canEdit || roles.some((r) =>
    ["ministry_leader", "secretary"].includes(r)
  );
  const canAddSongs = roles.some((r) =>
    ["admin_congregation", "pastor", "ministry_leader"].includes(r)
  );

  const [activeTab, setActiveTab] = useState("celebrations");

  // ── Celebrations tab state ──
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [celebrationsLoading, setCelebrationsLoading] = useState(true);
  const hasFetchedCel = useRef(false);

  // ── Próximas tab state ──
  const [upcomingInstances, setUpcomingInstances] = useState<CelebrationInstance[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(false);
  const hasFetchedUpcoming = useRef(false);

  // ── Modal / sheet state ──
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCelId, setSelectedCelId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedInstId, setSelectedInstId] = useState<string | null>(null);
  const [soViewOpen, setSoViewOpen] = useState(false);

  // ── Load celebrations ──
  const loadCelebrations = useCallback(async () => {
    if (hasFetchedCel.current) return;
    hasFetchedCel.current = true;
    setCelebrationsLoading(true);
    try {
      // The API doesn't support pagination here — it always returns the full list.
      const { data } = await api.get<Celebration[]>("/celebrations");
      setCelebrations(Array.isArray(data) ? data : []);
    } catch {
      setCelebrations([]);
    } finally {
      setCelebrationsLoading(false);
    }
  }, []);

  // ── Load upcoming instances ──
  const loadUpcoming = useCallback(async () => {
    if (hasFetchedUpcoming.current) return;
    hasFetchedUpcoming.current = true;
    setUpcomingLoading(true);
    try {
      // No `limit`/`upcoming` support — filter with date_from and cap client-side.
      const todayIso = new Date().toISOString().slice(0, 10);
      const { data } = await api.get<CelebrationInstance[]>(
        `/celebrations/instances?date_from=${todayIso}`
      );
      const sorted = (Array.isArray(data) ? data : []).sort(
        (a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
      );
      setUpcomingInstances(sorted.slice(0, 30));
    } catch {
      setUpcomingInstances([]);
    } finally {
      setUpcomingLoading(false);
    }
  }, []);

  useEffect(() => { loadCelebrations(); }, [loadCelebrations]);

  useEffect(() => {
    if (activeTab === "proximas") {
      hasFetchedUpcoming.current = false;
      loadUpcoming();
    }
  }, [activeTab, loadUpcoming]);

  function openDetail(celId: string) {
    setSelectedCelId(celId);
    setDetailOpen(true);
  }

  function openInstance(instId: string) {
    setSelectedInstId(instId);
    setSoViewOpen(true);
  }

  // ── Celebrations table columns ──
  const columns: Column<Celebration>[] = [
    {
      key: "name",
      header: "Nome",
      render: (row) => (
        <span className="font-medium text-ink dark:text-white">{row.name}</span>
      ),
    },
    {
      key: "schedule",
      header: "Dia / Horário",
      width: "160px",
      render: (row) => (
        <span className="text-stone">
          {[row.day_of_week != null ? WEEKDAY_LABELS[row.day_of_week] : null, row.start_time]
            .filter(Boolean)
            .join(" · ") || "—"}
        </span>
      ),
    },
    {
      key: "recurrence",
      header: "Recorrência",
      width: "120px",
      render: (row) => (
        <span className="text-stone">
          {row.recurrence
            ? RECURRENCE_LABELS[row.recurrence as keyof typeof RECURRENCE_LABELS] ?? row.recurrence
            : "—"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-medium text-ink dark:text-white">Celebrações</h1>
      </div>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex border-b border-[var(--border-default)]">
          <Tabs.Tab value="celebrations" className={tabBtn(activeTab === "celebrations")}>
            Celebrações
          </Tabs.Tab>
          <Tabs.Tab value="proximas" className={tabBtn(activeTab === "proximas")}>
            Próximas
          </Tabs.Tab>
        </Tabs.List>

        {/* ── Tab: Celebrações ── */}
        <Tabs.Panel value="celebrations" className="pt-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <p className="text-sm text-stone">
              {celebrations.length > 0
                ? `${celebrations.length} ${celebrations.length !== 1 ? "celebrações" : "celebração"}`
                : "Nenhuma celebração"}
            </p>
            {canEdit && (
              <Button
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
              >
                <Plus size={15} strokeWidth={1.5} />
                Nova celebração
              </Button>
            )}
          </div>

          <DataTable
            columns={columns}
            rows={celebrations}
            getRowKey={(r) => r.id}
            isLoading={celebrationsLoading}
            onRowClick={(row) => openDetail(row.id)}
            emptyState={
              <div className="flex flex-col items-center gap-3 py-10">
                <Calendar size={32} strokeWidth={1} className="text-stone" />
                <p className="text-sm text-stone">Nenhuma celebração cadastrada.</p>
                {canEdit && (
                  <Button
                    onClick={() => setCreateOpen(true)}
                    className="rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
                  >
                    Nova celebração
                  </Button>
                )}
              </div>
            }
          />
        </Tabs.Panel>

        {/* ── Tab: Próximas (timeline) ── */}
        <Tabs.Panel value="proximas" className="pt-5">
          {upcomingLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-4"
                >
                  <Skeleton className="mb-2 h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          ) : upcomingInstances.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Calendar size={32} strokeWidth={1} className="text-stone" />
              <p className="text-sm text-stone">
                Nenhuma instância próxima encontrada.
              </p>
              <p className="text-xs text-stone max-w-xs">
                As instâncias são geradas automaticamente com base nas celebrações recorrentes.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingInstances.map((inst) => {
                const hasOC = !!inst.serviceOrder;
                const startTime = celebrations.find((c) => c.id === inst.celebration.id)?.start_time;
                return (
                  <button
                    key={inst.id}
                    type="button"
                    onClick={() => openInstance(inst.id)}
                    className="flex items-center justify-between gap-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-4 text-left transition-shadow hover:shadow-sm group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-subtle)] text-stone group-hover:bg-navy group-hover:text-white transition-colors">
                        <FileText size={16} strokeWidth={1.5} />
                      </div>
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="truncate text-sm font-medium text-ink dark:text-white">
                          {inst.celebration.name}
                        </span>
                        <span className="text-xs text-stone">
                          {fmtDateTime(inst.scheduled_date)}
                          {startTime ? ` · ${startTime}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          hasOC
                            ? "bg-teal-dim text-teal"
                            : "bg-[var(--surface-subtle)] text-stone"
                        )}
                      >
                        {hasOC ? "Com OC" : "Sem OC"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Tabs.Panel>
      </Tabs.Root>

      {/* ── Modals / Sheets ── */}
      <CreateCelebrationModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          hasFetchedCel.current = false;
          loadCelebrations();
        }}
      />

      <CelebrationDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        celebrationId={selectedCelId}
        canEdit={canEdit}
        canAddSongs={canAddSongs}
      />

      <ServiceOrderView
        open={soViewOpen}
        onOpenChange={setSoViewOpen}
        instanceId={selectedInstId}
        canEdit={canEdit}
        canAddSongs={canAddSongs}
      />
    </div>
  );
}
