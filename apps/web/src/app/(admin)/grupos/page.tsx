"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/SearchInput";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { GroupDetailSheet } from "@/components/groups/GroupDetailSheet";
import { CreateGroupModal, GROUP_TYPES, type GroupType } from "@/components/groups/CreateGroupModal";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SmallGroup {
  id: string;
  name: string;
  type: GroupType;
  meeting_time?: string;
  leader?: { id: string; full_name: string };
  _count?: { memberships: number };
}

interface GroupsResponse {
  data: SmallGroup[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;

function typeLabel(type: GroupType): string {
  return GROUP_TYPES.find((t) => t.value === type)?.label ?? type;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GruposPage() {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  const canEdit =
    roles.includes("admin_congregation") ||
    roles.includes("tenant_admin") ||
    roles.includes("pastor");

  const [groups, setGroups] = useState<SmallGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<GroupType | "">("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchRef = useRef(0);

  const loadGroups = useCallback(async (p: number, q: string, type: string) => {
    const req = ++fetchRef.current;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (q) params.set("search", q);
      if (type) params.set("type", type);
      const { data } = await api.get<GroupsResponse>(`/small-groups?${params}`);
      if (req !== fetchRef.current) return;
      setGroups(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch {
      if (req !== fetchRef.current) return;
      setGroups([]);
      setTotal(0);
    } finally {
      if (req === fetchRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups(page, search, typeFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, typeFilter]);

  const handleSearch = useCallback((q: string) => {
    setPage(1);
    setSearch(q);
  }, []);

  const handleTypeFilter = useCallback((type: GroupType | "") => {
    setPage(1);
    setTypeFilter(type);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  function openSheet(id: string) {
    setSelectedId(id);
    setSheetOpen(true);
  }

  const columns: Column<SmallGroup>[] = [
    {
      key: "name",
      header: "Nome",
      render: (row) => (
        <span className="font-medium text-ink dark:text-white">{row.name}</span>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      width: "160px",
      render: (row) => (
        <span className="text-stone">{typeLabel(row.type)}</span>
      ),
    },
    {
      key: "leader",
      header: "Líder",
      width: "180px",
      render: (row) => (
        <span className="text-stone">{row.leader?.full_name ?? "—"}</span>
      ),
    },
    {
      key: "meeting_time",
      header: "Dia / Horário",
      width: "160px",
      render: (row) => (
        <span className="text-stone">{row.meeting_time ?? "—"}</span>
      ),
    },
    {
      key: "members",
      header: "Membros",
      width: "90px",
      render: (row) => (
        <span className="text-stone">{row._count?.memberships ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-ink dark:text-white">Grupos</h1>
          <p className="mt-0.5 text-sm text-stone">
            {total > 0 ? `${total} grupo${total !== 1 ? "s" : ""}` : "Nenhum grupo"}
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy text-white hover:bg-[var(--color-navy-dark)] text-sm"
          >
            <Plus size={15} strokeWidth={1.5} />
            Novo grupo
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Buscar grupos…"
          onSearch={handleSearch}
          className="w-full max-w-[280px]"
        />
        <select
          value={typeFilter}
          onChange={(e) => handleTypeFilter(e.target.value as GroupType | "")}
          className="h-9 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none dark:text-white"
        >
          <option value="">Todos os tipos</option>
          {GROUP_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        rows={groups}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        onRowClick={(row) => openSheet(row.id)}
        emptyState={<p className="py-8 text-center text-sm text-stone">Nenhum grupo encontrado.</p>}
      />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-stone">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-[8px] px-3 py-1.5 text-sm"
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-[8px] px-3 py-1.5 text-sm"
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {/* Detail sheet */}
      <GroupDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        groupId={selectedId}
        canEdit={canEdit}
        onUpdated={() => loadGroups(page, search, typeFilter)}
      />

      {/* Create modal */}
      <CreateGroupModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          loadGroups(1, search, typeFilter);
          setPage(1);
        }}
      />
    </div>
  );
}
