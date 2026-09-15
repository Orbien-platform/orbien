"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { Modal } from "@/components/ui/Modal";
import { NetworkFormModal, type NetworkFormValues } from "@/components/networks/NetworkFormModal";
import { useAuth } from "@/hooks/useAuth";
import api, { isForbidden } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Network {
  id: string;
  name: string;
  leader_person_id: string | null;
  health_goal_pct: number | null;
}

interface GoalStatus {
  goal_pct: number | null;
  current_pct: number | null;
  met: boolean | null;
  green: number;
  yellow: number;
  red: number;
  total: number;
}

interface SmallGroupRow {
  id: string;
  name: string;
  network_id: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function goalLabel(status: GoalStatus | undefined): string {
  if (!status) return "—";
  if (status.total === 0) return "Sem células";
  if (status.goal_pct === null) return `${status.current_pct}% saudável`;
  return `${status.current_pct}% de ${status.goal_pct}% (${status.met ? "atingida" : "não atingida"})`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RedesPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canEdit =
    roles.includes("admin_congregation") ||
    roles.includes("tenant_admin") ||
    roles.includes("pastor");

  const [networks, setNetworks] = useState<Network[]>([]);
  const [goalStatuses, setGoalStatuses] = useState<Record<string, GoalStatus>>({});
  const [accessDenied, setAccessDenied] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${reloadTick}`;
  const isLoading = loadedKey !== requestKey;

  const [formOpen, setFormOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState<NetworkFormValues | null>(null);
  // Muda a cada abertura (nova rede ou edição), forçando o NetworkFormModal a
  // remontar com estado limpo em vez de sincronizar via effect.
  const [formSeq, setFormSeq] = useState(0);

  const [manageNetwork, setManageNetwork] = useState<Network | null>(null);
  const [manageGroups, setManageGroups] = useState<SmallGroupRow[]>([]);
  const [unlinkedGroups, setUnlinkedGroups] = useState<SmallGroupRow[]>([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [linkGroupId, setLinkGroupId] = useState("");
  const [manageError, setManageError] = useState("");

  const reloadNetworks = useCallback(() => setReloadTick((t) => t + 1), []);

  // Cadeia de promises: todo setState acontece dentro de um callback, nunca
  // de forma síncrona no corpo do effect (mesmo padrão de grupos/page.tsx).
  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<Network[]>("/networks")
      .then(async ({ data }) => {
        if (signal.cancelled) return;
        setNetworks(data);
        setAccessDenied(false);

        const statuses = await Promise.allSettled(
          data.map((n) => api.get<GoalStatus>(`/networks/${n.id}/goal-status`)),
        );
        if (signal.cancelled) return;
        const byId: Record<string, GoalStatus> = {};
        statuses.forEach((result, index) => {
          if (result.status === "fulfilled") byId[data[index].id] = result.value.data;
        });
        setGoalStatuses(byId);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setNetworks([]);
        setGoalStatuses({});
        setAccessDenied(isForbidden(error));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(requestKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [requestKey]);

  function openCreate() {
    setEditingNetwork({ id: null, name: "", leader_person_id: null, health_goal_pct: null });
    setFormSeq((s) => s + 1);
    setFormOpen(true);
  }

  function openEdit(n: Network) {
    setEditingNetwork({
      id: n.id,
      name: n.name,
      leader_person_id: n.leader_person_id,
      health_goal_pct: n.health_goal_pct,
    });
    setFormSeq((s) => s + 1);
    setFormOpen(true);
  }

  function loadManageGroups(networkId: string) {
    setManageLoading(true);
    setManageError("");
    api
      .get<{ data: SmallGroupRow[] }>("/small-groups?limit=100")
      .then(({ data }) => {
        const all = data.data ?? [];
        setManageGroups(all.filter((g) => g.network_id === networkId));
        setUnlinkedGroups(all.filter((g) => g.network_id === null));
      })
      .catch(() => {
        setManageGroups([]);
        setUnlinkedGroups([]);
      })
      .finally(() => setManageLoading(false));
  }

  function openManage(n: Network) {
    setManageNetwork(n);
    setLinkGroupId("");
    loadManageGroups(n.id);
  }

  async function linkGroup() {
    if (!manageNetwork || !linkGroupId) return;
    setManageError("");
    try {
      await api.patch(`/small-groups/${linkGroupId}`, { network_id: manageNetwork.id });
      setLinkGroupId("");
      loadManageGroups(manageNetwork.id);
      reloadNetworks();
    } catch {
      setManageError("Erro ao vincular célula.");
    }
  }

  async function unlinkGroup(groupId: string) {
    if (!manageNetwork) return;
    setManageError("");
    try {
      await api.patch(`/small-groups/${groupId}`, { network_id: null });
      loadManageGroups(manageNetwork.id);
      reloadNetworks();
    } catch {
      setManageError("Erro ao desvincular célula.");
    }
  }

  const columns: Column<Network>[] = [
    {
      key: "name",
      header: "Nome",
      render: (row) => (
        <span className="font-medium text-ink dark:text-white">{row.name}</span>
      ),
    },
    {
      key: "goal",
      header: "Meta de saúde",
      render: (row) => {
        const status = goalStatuses[row.id];
        const total = status?.total ?? 0;
        const dotColor: string =
          total === 0 ? "bg-stone" : status && status.met === false ? "bg-crimson" : "bg-teal";
        return (
          <span className="flex items-center gap-1.5 text-stone">
            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColor}`} />
            {goalLabel(status)}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: "160px",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-[8px]"
            aria-label="Gerenciar células"
            title="Gerenciar células"
            onClick={(e) => { e.stopPropagation(); openManage(row); }}
          >
            <Link2 size={14} strokeWidth={1.5} />
          </Button>
          {canEdit && (
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px]"
              aria-label="Editar rede"
              title="Editar rede"
              onClick={(e) => { e.stopPropagation(); openEdit(row); }}
            >
              <Pencil size={14} strokeWidth={1.5} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink dark:text-white">Redes</h1>
          <p className="mt-0.5 text-sm text-stone">
            {networks.length > 0 ? `${networks.length} rede${networks.length !== 1 ? "s" : ""}` : "Nenhuma rede"}
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
          >
            <Plus size={15} strokeWidth={1.5} />
            Nova rede
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={networks}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        onRowClick={openManage}
        emptyState={
          accessDenied ? (
            <NoAccessState resource="Redes" />
          ) : (
            <p className="py-8 text-center text-sm text-stone">Nenhuma rede cadastrada.</p>
          )
        }
      />

      <NetworkFormModal
        key={formSeq}
        open={formOpen}
        onOpenChange={setFormOpen}
        network={editingNetwork}
        onSaved={reloadNetworks}
      />

      {/* Gerenciar células da rede — vincular/desvincular (PROD-20, CEL20-07) */}
      <Modal
        open={manageNetwork !== null}
        onOpenChange={(v) => { if (!v) setManageNetwork(null); }}
        title={manageNetwork ? `Células de ${manageNetwork.name}` : "Células da rede"}
        description="Vincule ou desvincule células desta congregação."
        className="max-w-lg"
      >
        {manageLoading ? (
          <p className="py-6 text-center text-sm text-stone">Carregando…</p>
        ) : (
          <div className="flex flex-col gap-4">
            {manageError && (
              <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson" role="alert">
                {manageError}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              {manageGroups.length === 0 ? (
                <p className="text-sm text-stone">Nenhuma célula vinculada.</p>
              ) : (
                manageGroups.map((g) => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border-default)] px-3 py-2"
                  >
                    <span className="text-sm text-ink dark:text-white">{g.name}</span>
                    <button
                      type="button"
                      onClick={() => unlinkGroup(g.id)}
                      className="text-stone hover:text-crimson"
                      aria-label={`Desvincular ${g.name}`}
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-[var(--border-default)] pt-3">
              <select
                aria-label="Selecione uma célula sem rede"
                value={linkGroupId}
                onChange={(e) => setLinkGroupId(e.target.value)}
                className="h-9 flex-1 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
              >
                <option value="">— Selecione uma célula sem rede —</option>
                {unlinkedGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <Button
                type="button"
                disabled={!linkGroupId}
                onClick={linkGroup}
                className="rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)]"
              >
                Vincular
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
