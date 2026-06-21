"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateMinistryModal } from "@/components/volunteers/CreateMinistryModal";
import { MinistryDetailSheet } from "@/components/volunteers/MinistryDetailSheet";
import { MinistryTree } from "@/components/volunteers/MinistryTree";
import { CreateScheduleModal } from "@/components/volunteers/CreateScheduleModal";
import { ScheduleDetailSheet } from "@/components/volunteers/ScheduleDetailSheet";
import { useAuth } from "@/hooks/useAuth";
import { flattenMinistryTree, type MinistryTreeNode } from "@/lib/ministryTree";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScheduleStatus = "draft" | "published" | "finalized";
type AssignmentStatus = "pending" | "confirmed" | "declined";

interface MinistryCounts {
  leaders: number;
  volunteers: number;
}

interface Schedule {
  id: string;
  title: string;
  date: string;
  status: ScheduleStatus;
  ministry?: { id: string; name: string; color?: string } | null;
  slots?: { id: string; required_count: number; assignments?: unknown[] }[];
  _count?: { slots?: number; assignments?: number };
}

interface MyAssignment {
  id: string;
  status: AssignmentStatus;
  schedule?: {
    id: string;
    title: string;
    date: string;
    ministry?: { id: string; name: string } | null;
  } | null;
  slot?: { role_name: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
}

function tabBtn(active: boolean) {
  return cn(
    "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
    active
      ? "border-navy text-navy dark:text-white dark:border-white"
      : "border-transparent text-stone hover:text-ink dark:hover:text-white"
  );
}

function ScheduleBadge({ status }: { status: ScheduleStatus }) {
  const map: Record<ScheduleStatus, [string, string]> = {
    draft: ["Rascunho", "bg-[var(--surface-subtle)] text-stone"],
    published: ["Publicada", "bg-teal-dim text-teal"],
    finalized: ["Finalizada", "bg-navy-dim text-navy"],
  };
  const [label, cls] = map[status] ?? [status, ""];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const map: Record<AssignmentStatus, [string, string]> = {
    pending: ["Pendente", "bg-[var(--surface-subtle)] text-stone"],
    confirmed: ["Confirmado", "bg-teal-dim text-teal"],
    declined: ["Recusou", "bg-crimson-dim text-crimson"],
  };
  const [label, cls] = map[status] ?? [status, ""];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VoluntariosPage() {
  const { user } = useAuth();

  const roles = user?.roles ?? [];
  const isAdmin = roles.includes("admin_congregation") || roles.includes("tenant_admin");
  const isPastor = roles.includes("pastor");
  const isLeader = roles.includes("ministry_leader");

  const canCreate = isAdmin;
  const canPublish = isAdmin || isPastor;
  const canManage = isAdmin || isPastor || isLeader;

  const [activeTab, setActiveTab] = useState("ministerios");

  // ── Ministérios state ──
  const [ministryTree, setMinistryTree] = useState<MinistryTreeNode[]>([]);
  const [ministryCounts, setMinistryCounts] = useState<Record<string, MinistryCounts>>({});
  const [ministriesLoading, setMinistriesLoading] = useState(true);
  const hasFetchedMin = useRef(false);

  const flatMinistries = flattenMinistryTree(ministryTree);

  // ── Escalas state ──
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [scheduleMinFilter, setScheduleMinFilter] = useState("");
  const [scheduleStatusFilter, setScheduleStatusFilter] = useState<ScheduleStatus | "">("");
  const hasFetchedSch = useRef(false);

  // ── Meus Turnos state ──
  const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const hasFetchedMy = useRef(false);

  // ── Sheet / modal state ──
  const [createMinOpen, setCreateMinOpen] = useState(false);
  const [selectedMinId, setSelectedMinId] = useState<string | null>(null);
  const [minSheetOpen, setMinSheetOpen] = useState(false);

  const [createSchOpen, setCreateSchOpen] = useState(false);
  const [selectedSchId, setSelectedSchId] = useState<string | null>(null);
  const [schSheetOpen, setSchSheetOpen] = useState(false);

  // ── Load ministries ──
  const loadMinistries = useCallback(async () => {
    if (hasFetchedMin.current) return;
    hasFetchedMin.current = true;
    setMinistriesLoading(true);
    let ids: string[] = [];
    try {
      const { data } = await api.get<MinistryTreeNode[]>("/volunteers/ministries");
      setMinistryTree(data);
      ids = flattenMinistryTree(data).map((m) => m.id);
    } catch {
      setMinistryTree([]);
    } finally {
      setMinistriesLoading(false);
    }

    // The tree endpoint doesn't return aggregate counts, so fetch each
    // ministry's detail (leaders/volunteers) one at a time — sequential to
    // avoid piling concurrent requests onto the dev proxy/API.
    for (const id of ids) {
      try {
        const { data } = await api.get<{ leaders: unknown[]; volunteers: unknown[] }>(
          `/volunteers/ministries/${id}`
        );
        setMinistryCounts((prev) => ({
          ...prev,
          [id]: { leaders: data.leaders?.length ?? 0, volunteers: data.volunteers?.length ?? 0 },
        }));
      } catch {
        // Skip — that ministry's card just shows 0 counts.
      }
    }
  }, []);

  // ── Load schedules ──
  const loadSchedules = useCallback(async (minId: string, status: string) => {
    if (hasFetchedSch.current) return;
    hasFetchedSch.current = true;
    setSchedulesLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (minId) params.set("ministry_id", minId);
      if (status) params.set("status", status);
      const { data } = await api.get<{ data: Schedule[] } | Schedule[]>(
        `/volunteers/schedules?${params}`
      );
      setSchedules(Array.isArray(data) ? data : data.data ?? []);
    } catch {
      setSchedules([]);
    } finally {
      setSchedulesLoading(false);
    }
  }, []);

  // ── Load my assignments ──
  const loadMyAssignments = useCallback(async () => {
    if (hasFetchedMy.current) return;
    hasFetchedMy.current = true;
    setMyLoading(true);
    try {
      const { data } = await api.get<{ data: MyAssignment[] } | MyAssignment[]>(
        "/volunteers/my-assignments"
      );
      setMyAssignments(Array.isArray(data) ? data : data?.data ?? []);
    } catch {
      // Endpoint may not exist — show empty state
      setMyAssignments([]);
    } finally {
      setMyLoading(false);
    }
  }, []);

  // Initial loads
  useEffect(() => { loadMinistries(); }, [loadMinistries]);

  // Load on tab switch
  useEffect(() => {
    if (activeTab === "escalas") {
      hasFetchedSch.current = false;
      loadSchedules(scheduleMinFilter, scheduleStatusFilter);
    }
    if (activeTab === "meus-turnos") {
      hasFetchedMy.current = false;
      loadMyAssignments();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Reload schedules on filter change
  useEffect(() => {
    if (activeTab !== "escalas") return;
    hasFetchedSch.current = false;
    loadSchedules(scheduleMinFilter, scheduleStatusFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleMinFilter, scheduleStatusFilter]);

  // ── Assignment confirm / decline ──
  async function confirmAssignment(id: string) {
    setConfirmingId(id);
    try {
      await api.post(`/volunteers/assignments/${id}/confirm`);
      setMyAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "confirmed" as AssignmentStatus } : a))
      );
    } catch {
      // ignore
    } finally {
      setConfirmingId(null);
    }
  }

  async function declineAssignment(id: string) {
    setDecliningId(id);
    try {
      await api.post(`/volunteers/assignments/${id}/decline`);
      setMyAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: "declined" as AssignmentStatus } : a))
      );
    } catch {
      // ignore
    } finally {
      setDecliningId(null);
    }
  }

  // ── Schedule table columns ──
  const scheduleColumns: Column<Schedule>[] = [
    {
      key: "title",
      header: "Título",
      render: (row) => (
        <span className="font-medium text-ink dark:text-white">{row.title}</span>
      ),
    },
    {
      key: "ministry",
      header: "Ministério",
      width: "160px",
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.ministry?.color && (
            <div
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
              style={{ backgroundColor: row.ministry?.color ?? "#1E3A7B" }}
            />
          )}
          <span className="text-stone">{row.ministry?.name ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "date",
      header: "Data",
      width: "110px",
      render: (row) => <span className="text-stone">{fmtDate(row.date)}</span>,
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      render: (row) => <ScheduleBadge status={row.status} />,
    },
    {
      key: "slots",
      header: "Slots",
      width: "90px",
      render: (row) => {
        const total = row._count?.slots ?? row.slots?.length ?? 0;
        const filled = row.slots?.reduce(
          (acc, s) => acc + (s.assignments?.filter((a: unknown) => (a as { status: string }).status !== "declined").length ?? 0),
          0
        ) ?? 0;
        return (
          <span className="text-stone">{total > 0 ? `${filled}/${total}` : "—"}</span>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-medium text-ink dark:text-white">Voluntários e Escalas</h1>
      </div>

      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex border-b border-[var(--border-default)]">
          <Tabs.Tab value="ministerios" className={tabBtn(activeTab === "ministerios")}>
            Ministérios
          </Tabs.Tab>
          <Tabs.Tab value="escalas" className={tabBtn(activeTab === "escalas")}>
            Escalas
          </Tabs.Tab>
          <Tabs.Tab value="meus-turnos" className={tabBtn(activeTab === "meus-turnos")}>
            Meus Turnos
          </Tabs.Tab>
        </Tabs.List>

        {/* ── Tab: Ministérios ── */}
        <Tabs.Panel value="ministerios" className="pt-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <p className="text-sm text-stone">
              {flatMinistries.length > 0
                ? `${flatMinistries.length} ministério${flatMinistries.length !== 1 ? "s" : ""}`
                : "Nenhum ministério"}
            </p>
            {canCreate && (
              <Button
                onClick={() => setCreateMinOpen(true)}
                className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
              >
                <Plus size={15} strokeWidth={1.5} />
                Novo ministério
              </Button>
            )}
          </div>

          {ministriesLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-3.5">
                  <Skeleton className="mb-2 h-5 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          ) : ministryTree.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone">
              Nenhum ministério cadastrado.{" "}
              {canCreate && "Clique em \"Novo ministério\" para começar."}
            </p>
          ) : (
            <MinistryTree
              nodes={ministryTree}
              counts={ministryCounts}
              onSelect={(id) => { setSelectedMinId(id); setMinSheetOpen(true); }}
            />
          )}
        </Tabs.Panel>

        {/* ── Tab: Escalas ── */}
        <Tabs.Panel value="escalas" className="pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Ministry filter */}
              <select
                value={scheduleMinFilter}
                onChange={(e) => setScheduleMinFilter(e.target.value)}
                className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
              >
                <option value="">Todos os ministérios</option>
                {flatMinistries.map((m) => (
                  <option key={m.id} value={m.id}>
                    {"  ".repeat(m.depth)}
                    {m.depth > 0 ? "↳ " : ""}
                    {m.name}
                  </option>
                ))}
              </select>

              {/* Status filter */}
              <select
                value={scheduleStatusFilter}
                onChange={(e) => setScheduleStatusFilter(e.target.value as ScheduleStatus | "")}
                className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
              >
                <option value="">Todos os status</option>
                <option value="draft">Rascunho</option>
                <option value="published">Publicada</option>
                <option value="finalized">Finalizada</option>
              </select>
            </div>

            {canCreate && (
              <Button
                onClick={() => setCreateSchOpen(true)}
                className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
              >
                <Plus size={15} strokeWidth={1.5} />
                Nova escala
              </Button>
            )}
          </div>

          <DataTable
            columns={scheduleColumns}
            rows={schedules}
            getRowKey={(row) => row.id}
            isLoading={schedulesLoading}
            onRowClick={(row) => { setSelectedSchId(row.id); setSchSheetOpen(true); }}
            emptyState={
              <p className="py-8 text-center text-sm text-stone">
                Nenhuma escala encontrada.
              </p>
            }
          />
        </Tabs.Panel>

        {/* ── Tab: Meus Turnos ── */}
        <Tabs.Panel value="meus-turnos" className="pt-5">
          {myLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-4">
                  <Skeleton className="mb-2 h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
          ) : myAssignments.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone">
              Você não tem turnos agendados.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {myAssignments.map((a) => {
                const isPending = a.status === "pending";
                const isConfirming = confirmingId === a.id;
                const isDeclining = decliningId === a.id;

                return (
                  <div
                    key={a.id}
                    className="flex flex-col gap-3 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {/* Info */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-ink dark:text-white">
                        {a.schedule?.title ?? "—"}
                      </span>
                      <span className="text-xs text-stone">
                        {a.schedule?.ministry?.name ?? "—"}
                        {a.slot?.role_name ? ` · ${a.slot.role_name}` : ""}
                      </span>
                      <span className="text-xs text-stone">
                        {a.schedule?.date ? fmtDate(a.schedule.date) : "—"}
                      </span>
                    </div>

                    {/* Status + actions */}
                    <div className="flex items-center gap-2">
                      <AssignmentStatusBadge status={a.status} />
                      {isPending && (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            onClick={() => confirmAssignment(a.id)}
                            disabled={isConfirming || isDeclining}
                            className="flex items-center gap-1 rounded-[6px] bg-teal px-2.5 py-1 text-xs text-white hover:bg-teal/90"
                          >
                            {isConfirming ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <CheckCircle2 size={11} strokeWidth={1.5} />
                            )}
                            Confirmar
                          </Button>
                          <Button
                            type="button"
                            onClick={() => declineAssignment(a.id)}
                            disabled={isConfirming || isDeclining}
                            className="flex items-center gap-1 rounded-[6px] bg-crimson px-2.5 py-1 text-xs text-white hover:bg-crimson/90"
                          >
                            {isDeclining ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <XCircle size={11} strokeWidth={1.5} />
                            )}
                            Recusar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tabs.Panel>
      </Tabs.Root>

      {/* ── Sheets / Modals ── */}
      <CreateMinistryModal
        open={createMinOpen}
        onOpenChange={setCreateMinOpen}
        tree={ministryTree}
        onCreated={() => {
          hasFetchedMin.current = false;
          loadMinistries();
        }}
      />

      <MinistryDetailSheet
        open={minSheetOpen}
        onOpenChange={setMinSheetOpen}
        ministryId={selectedMinId}
        canEdit={canCreate}
        tree={ministryTree}
        onSelectMinistry={(id) => setSelectedMinId(id)}
        onUpdated={() => {
          hasFetchedMin.current = false;
          loadMinistries();
        }}
      />

      <CreateScheduleModal
        open={createSchOpen}
        onOpenChange={setCreateSchOpen}
        onCreated={(schId) => {
          setCreateSchOpen(false);
          hasFetchedSch.current = false;
          loadSchedules(scheduleMinFilter, scheduleStatusFilter);
          setSelectedSchId(schId);
          setSchSheetOpen(true);
        }}
      />

      <ScheduleDetailSheet
        open={schSheetOpen}
        onOpenChange={setSchSheetOpen}
        scheduleId={selectedSchId}
        canManage={canManage}
        canPublish={canPublish}
        onUpdated={() => {
          hasFetchedSch.current = false;
          loadSchedules(scheduleMinFilter, scheduleStatusFilter);
        }}
      />
    </div>
  );
}
