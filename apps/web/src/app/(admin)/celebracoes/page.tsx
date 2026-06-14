"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, FileText, Calendar } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateCelebrationModal, RECURRENCE_LABELS } from "@/components/celebrations/CreateCelebrationModal";
import { CelebrationDetailSheet } from "@/components/celebrations/CelebrationDetailSheet";
import { ServiceOrderView } from "@/components/celebrations/ServiceOrderView";
import { useAuth } from "@/hooks/useAuth";
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
  next_instance?: { id: string; date: string } | null;
  status?: string;
  _count?: { instances?: number };
}

interface CelebrationInstance {
  id: string;
  date: string;
  status?: string;
  celebration: { id: string; name: string; time?: string };
  service_order?: { id: string } | null;
  assigned_count?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

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
      const { data } = await api.get<{ data: Celebration[] } | Celebration[]>(
        "/celebrations?limit=50"
      );
      setCelebrations(Array.isArray(data) ? data : data.data ?? []);
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
      // Try global instances endpoint first
      const { data } = await api.get<{ data: CelebrationInstance[] } | CelebrationInstance[]>(
        "/celebrations/instances?limit=30&upcoming=true"
      );
      setUpcomingInstances(Array.isArray(data) ? data : data.data ?? []);
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
          {[row.day_of_week, row.time].filter(Boolean).join(" · ") || "—"}
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
    {
      key: "next",
      header: "Próxima",
      width: "120px",
      render: (row) => (
        <span className="text-stone">
          {row.next_instance ? fmtDate(row.next_instance.date) : "—"}
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
                ? `${celebrations.length} celebração${celebrations.length !== 1 ? "ões" : ""}`
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
              {upcomingInstances
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((inst) => {
                  const hasOC = !!inst.service_order;
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
                            {fmtDateTime(inst.date)}
                            {inst.celebration.time ? ` · ${inst.celebration.time}` : ""}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-2">
                        {inst.assigned_count != null && (
                          <span className="text-xs text-stone">{inst.assigned_count} escalados</span>
                        )}
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
