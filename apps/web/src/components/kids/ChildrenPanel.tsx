"use client";

import { useEffect, useState } from "react";
import { Baby, Plus } from "lucide-react";
import { ChildFicha } from "@/components/kids/ChildFicha";
import { ChildFormModal } from "@/components/kids/ChildFormModal";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { SearchInput } from "@/components/ui/SearchInput";
import { isForbidden } from "@/lib/api";
import { ageInMonths, formatAge, searchChildren, type KidsChild } from "@/lib/kids";

/** Crianças cadastradas na congregação: busca, cadastro pela secretaria e ficha. */
export function ChildrenPanel({ canManage }: { canManage: boolean }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<KidsChild[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const key = `${search}|${reloadKey}`;
  const isLoading = loadedKey !== key;

  useEffect(() => {
    const signal = { cancelled: false };
    searchChildren(search)
      .then((data) => {
        if (signal.cancelled) return;
        setRows(data);
        setFailed(false);
        setDenied(false);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setRows([]);
        setDenied(isForbidden(error));
        setFailed(!isForbidden(error));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(key);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [search, key]);

  const reload = () => setReloadKey((k) => k + 1);

  if (openId) {
    return <ChildFicha childId={openId} canManage={canManage} onBack={() => setOpenId(null)} onChanged={reload} />;
  }
  if (denied) return <NoAccessState resource="Crianças" />;

  const columns: Column<KidsChild>[] = [
    {
      key: "name",
      header: "Criança",
      render: (c) => <span className="font-medium text-ink dark:text-white">{c.full_name}</span>,
    },
    {
      key: "age",
      header: "Idade",
      width: "160px",
      render: (c) => (
        <span className="text-stone">{c.birth_date ? formatAge(ageInMonths(c.birth_date)) : "Sem data de nascimento"}</span>
      ),
    },
  ];

  return (
    <section aria-label="Crianças" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput placeholder="Buscar criança pelo nome" onSearch={setSearch} className="w-full max-w-xs" />
        {canManage ? (
          <Button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy text-sm text-white hover:bg-[var(--color-navy-dark)]"
          >
            <Plus size={15} strokeWidth={1.5} />
            Nova criança
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(c) => c.id}
        onRowClick={(c) => setOpenId(c.id)}
        isLoading={isLoading}
        skeletonRows={4}
        error={failed ? "Não foi possível carregar as crianças." : undefined}
        onRetry={reload}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Baby size={32} strokeWidth={1} className="text-stone" aria-hidden="true" />
            <p className="text-sm font-medium text-ink dark:text-white">
              {search.trim() ? "Nenhuma criança com esse nome" : "Nenhuma criança cadastrada"}
            </p>
            <p className="max-w-sm text-sm text-stone">
              {search.trim()
                ? "Confira a grafia ou cadastre a criança."
                : "Cadastre a criança com o responsável e o consentimento dele. Os responsáveis também podem cadastrar pelo app."}
            </p>
          </div>
        }
      />

      {creating ? (
        <ChildFormModal
          open
          onOpenChange={(next) => !next && setCreating(false)}
          child={null}
          onSaved={(id) => {
            reload();
            setOpenId(id);
          }}
        />
      ) : null}
    </section>
  );
}
