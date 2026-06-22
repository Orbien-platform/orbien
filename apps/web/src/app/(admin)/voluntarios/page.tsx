"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Tabs } from "@base-ui/react/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateMinistryModal } from "@/components/volunteers/CreateMinistryModal";
import { MinistryDetailSheet } from "@/components/volunteers/MinistryDetailSheet";
import { MinistryTree } from "@/components/volunteers/MinistryTree";
import { useAuth } from "@/hooks/useAuth";
import { flattenMinistryTree, type MinistryTreeNode } from "@/lib/ministryTree";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type AssignmentStatus = "pending" | "confirmed" | "declined";

interface MinistryCounts {
  leaders: number;
  volunteers: number;
}

interface MyAssignment {
  id: string;
  status: AssignmentStatus;
  slot?: {
    role_name: string;
    schedule?: {
      title: string;
      scheduled_date: string;
      ministry?: { name: string } | null;
    } | null;
  };
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

  const canCreate = isAdmin;

  const [activeTab, setActiveTab] = useState("ministerios");

  // ── Ministérios state ──
  const [ministryTree, setMinistryTree] = useState<MinistryTreeNode[]>([]);
  const [ministryCounts, setMinistryCounts] = useState<Record<string, MinistryCounts>>({});
  const [ministriesLoading, setMinistriesLoading] = useState(true);
  const hasFetchedMin = useRef(false);

  const flatMinistries = flattenMinistryTree(ministryTree);

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
    if (activeTab === "meus-turnos") {
      hasFetchedMy.current = false;
      loadMyAssignments();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

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

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-medium text-ink dark:text-white">Voluntários</h1>
      </div>

      {/* Tabs */}
      <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
        <Tabs.List className="flex border-b border-[var(--border-default)]">
          <Tabs.Tab value="ministerios" className={tabBtn(activeTab === "ministerios")}>
            Ministérios
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
                        {a.slot?.schedule?.title ?? "—"}
                      </span>
                      <span className="text-xs text-stone">
                        {a.slot?.schedule?.ministry?.name ?? "—"}
                        {a.slot?.role_name ? ` · ${a.slot.role_name}` : ""}
                      </span>
                      <span className="text-xs text-stone">
                        {a.slot?.schedule?.scheduled_date ? fmtDate(a.slot.schedule.scheduled_date) : "—"}
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
    </div>
  );
}
