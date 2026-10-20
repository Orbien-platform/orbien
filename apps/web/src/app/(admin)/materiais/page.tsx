"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { MaterialFormModal } from "@/components/materials/MaterialFormModal";
import { useAuth } from "@/hooks/useAuth";
import api, { isForbidden } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaterialRow {
  id: string;
  title: string;
  audience: "all_networks" | "network" | "group";
  visibility: "all" | "leaders_only";
  publish_at: string;
  materialTargets: { small_group_id: string; smallGroup?: { name: string } }[];
}

interface Network {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function audienceLabel(row: MaterialRow, networks: Record<string, string>, networkOf: string | null): string {
  if (row.audience === "all_networks") return "Todas as redes";
  if (row.audience === "network") return networkOf ? `Rede ${networks[networkOf] ?? ""}`.trim() : "Uma rede";
  const first = row.materialTargets[0]?.smallGroup?.name;
  return first ? `PG ${first}` : "Um PG";
}

function releaseLabel(iso: string): string {
  const date = new Date(iso);
  const text = date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return date > new Date() ? `Libera em ${text}` : `Liberado em ${text}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MateriaisPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canCreate = ["tenant_admin", "admin_congregation", "pastor", "secretary"].some((r) =>
    roles.includes(r)
  );

  const [rows, setRows] = useState<(MaterialRow & { network_id?: string | null })[]>([]);
  const [networks, setNetworks] = useState<Record<string, string>>({});
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${reloadTick}`;
  const isLoading = loadedKey !== requestKey;

  const [formOpen, setFormOpen] = useState(false);
  const [formSeq, setFormSeq] = useState(0);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    const signal = { cancelled: false };
    Promise.all([
      api.get<{ data: (MaterialRow & { network_id?: string | null })[] }>("/study-materials?limit=100"),
      api.get<Network[]>("/networks").catch(() => ({ data: [] as Network[] })),
    ])
      .then(([materials, nets]) => {
        if (signal.cancelled) return;
        setRows(materials.data.data ?? []);
        setNetworks(Object.fromEntries(nets.data.map((n) => [n.id, n.name])));
        setAccessDenied(false);
        setLoadError(false);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setRows([]);
        const denied = isForbidden(error);
        setAccessDenied(denied);
        // Falha que não é falta de acesso não pode virar "nenhum material": quem
        // lê a lista vazia como fato cria material em duplicidade.
        setLoadError(!denied);
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(requestKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [requestKey]);

  function openCreate() {
    setFormSeq((s) => s + 1);
    setFormOpen(true);
  }

  const columns: Column<MaterialRow & { network_id?: string | null }>[] = [
    {
      key: "title",
      header: "Material",
      render: (row) => <span className="font-medium text-ink dark:text-white">{row.title}</span>,
    },
    {
      key: "audience",
      header: "Para quem",
      render: (row) => (
        <span className="text-stone">{audienceLabel(row, networks, row.network_id ?? null)}</span>
      ),
    },
    {
      key: "visibility",
      header: "Quem vê",
      render: (row) => (
        <span className="text-stone">
          {row.visibility === "leaders_only" ? "Somente líderes" : "Todos os participantes"}
        </span>
      ),
    },
    {
      key: "release",
      header: "Liberação",
      render: (row) => <span className="text-stone">{releaseLabel(row.publish_at)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Materiais</h1>
          <p className="mt-0.5 text-sm text-stone">
            {rows.length > 0
              ? `${rows.length} material${rows.length !== 1 ? "is" : ""}`
              : "Nenhum material"}
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy text-sm text-white hover:bg-[var(--color-navy-dark)]"
          >
            <Plus size={15} strokeWidth={1.5} />
            Novo material
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        error={loadError ? "Não foi possível carregar os materiais." : undefined}
        onRetry={loadError ? reload : undefined}
        emptyState={
          accessDenied ? (
            <NoAccessState resource="Materiais" />
          ) : (
            <p className="py-8 text-center text-sm text-stone">
              Nenhum material ainda. Use &quot;Novo material&quot; para enviar o primeiro.
            </p>
          )
        }
      />

      <MaterialFormModal key={formSeq} open={formOpen} onOpenChange={setFormOpen} onSaved={reload} />
    </div>
  );
}
