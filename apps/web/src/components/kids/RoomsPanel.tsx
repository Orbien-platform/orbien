"use client";

import { useEffect, useState } from "react";
import { Baby, Loader2, Pencil, Plus, Power } from "lucide-react";
import { RoomFormModal } from "@/components/kids/RoomFormModal";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { isForbidden } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { deactivateRoom, formatAgeRange, listRooms, updateRoom, type KidsRoom } from "@/lib/kids";

/** Catálogo de turmas da congregação (KIDS-01). */
export function RoomsPanel({ canManage }: { canManage: boolean }) {
  const [rooms, setRooms] = useState<KidsRoom[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<KidsRoom | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<KidsRoom | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const key = `${showInactive}|${reloadKey}`;
  const isLoading = loadedKey !== key;

  useEffect(() => {
    const signal = { cancelled: false };
    listRooms(showInactive)
      .then((data) => {
        if (signal.cancelled) return;
        setRooms(data);
        setFailed(false);
        setDenied(false);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setRooms([]);
        setDenied(isForbidden(error));
        setFailed(!isForbidden(error));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(key);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [showInactive, key]);

  const reload = () => setReloadKey((k) => k + 1);

  async function confirmDeactivate() {
    if (!deactivating) return;
    setBusy(true);
    setActionError(null);
    try {
      await deactivateRoom(deactivating.id);
      setDeactivating(null);
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Não foi possível desativar a turma."));
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(room: KidsRoom) {
    setActionError(null);
    try {
      await updateRoom(room.id, { is_active: true });
      reload();
    } catch (err) {
      setActionError(apiErrorMessage(err, "Não foi possível reativar a turma."));
    }
  }

  if (denied) return <NoAccessState resource="Turmas" />;

  const columns: Column<KidsRoom>[] = [
    {
      key: "name",
      header: "Turma",
      render: (r) => (
        <span className={r.is_active ? "font-medium text-ink dark:text-white" : "font-medium text-stone"}>{r.name}</span>
      ),
    },
    {
      key: "range",
      header: "Faixa etária",
      width: "150px",
      render: (r) => <span className="text-stone">{formatAgeRange(r.min_age_months, r.max_age_months)}</span>,
    },
    {
      key: "out",
      header: "Fora da faixa",
      width: "140px",
      render: (r) => <span className="text-stone">{r.allows_out_of_range ? "Confirma na hora" : "Não aceita"}</span>,
    },
    {
      key: "capacity",
      header: "Capacidade",
      width: "110px",
      render: (r) => <span className="font-mono text-stone">{r.capacity ?? "—"}</span>,
    },
    {
      key: "volunteers",
      header: "Voluntários",
      width: "110px",
      render: (r) => <span className="font-mono text-stone">{r.min_volunteers}</span>,
    },
    {
      key: "status",
      header: "Situação",
      width: "110px",
      render: (r) => (
        <span
          className={
            r.is_active
              ? "rounded-full bg-teal-dim px-2 py-0.5 text-xs font-medium text-teal"
              : "rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium text-stone"
          }
        >
          {r.is_active ? "Ativa" : "Desativada"}
        </span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            width: "90px",
            render: (r: KidsRoom) => (
              <div className="flex items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setEditing(r);
                  }}
                  aria-label={`Editar a turma ${r.name}`}
                  className="rounded-[6px] p-1.5 text-stone outline-none hover:bg-[var(--surface-subtle)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Pencil size={14} strokeWidth={1.5} />
                </button>
                {r.is_active ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActionError(null);
                      setDeactivating(r);
                    }}
                    aria-label={`Desativar a turma ${r.name}`}
                    className="rounded-[6px] p-1.5 text-stone outline-none hover:bg-[var(--surface-subtle)] hover:text-crimson focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Power size={14} strokeWidth={1.5} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void reactivate(r)}
                    aria-label={`Reativar a turma ${r.name}`}
                    className="rounded-[6px] p-1.5 text-stone outline-none hover:bg-[var(--surface-subtle)] hover:text-teal focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Power size={14} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <section aria-label="Turmas" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-stone">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-[var(--brand)]"
          />
          Mostrar desativadas
        </label>
        {canManage ? (
          <Button
            onClick={() => {
              setActionError(null);
              setEditing("new");
            }}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy text-sm text-white hover:bg-[var(--color-navy-dark)]"
          >
            <Plus size={15} strokeWidth={1.5} />
            Nova turma
          </Button>
        ) : null}
      </div>

      {actionError && !deactivating ? (
        <p role="alert" className="text-sm text-crimson">
          {actionError}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={rooms}
        getRowKey={(r) => r.id}
        isLoading={isLoading}
        skeletonRows={4}
        error={failed ? "Não foi possível carregar as turmas." : undefined}
        onRetry={reload}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Baby size={32} strokeWidth={1} className="text-stone" aria-hidden="true" />
            <p className="text-sm font-medium text-ink dark:text-white">Nenhuma turma cadastrada</p>
            <p className="max-w-sm text-sm text-stone">
              Cadastre as turmas da congregação, cada uma com a sua faixa etária. Depois abra-as nos cultos.
            </p>
          </div>
        }
      />

      {editing ? (
        <RoomFormModal
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(next) => !next && setEditing(null)}
          room={editing === "new" ? null : editing}
          onSaved={reload}
        />
      ) : null}

      <Modal
        open={deactivating !== null}
        onOpenChange={(next) => !next && setDeactivating(null)}
        title="Desativar esta turma?"
        description={deactivating?.name}
      >
        <p className="text-sm text-stone">
          As sessões já abertas continuam e o histórico fica. A turma só deixa de poder ser aberta em novos cultos, e
          dá para reativá-la depois.
        </p>
        {actionError ? (
          <p role="alert" className="mt-3 text-sm text-crimson">
            {actionError}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeactivating(null)}
            disabled={busy}
            className="rounded-[8px] px-3 py-1.5 text-sm text-stone hover:bg-[var(--surface-subtle)]"
          >
            Voltar
          </button>
          <Button
            type="button"
            onClick={confirmDeactivate}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-[8px] bg-navy px-3 py-1.5 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            Desativar turma
          </Button>
        </div>
      </Modal>
    </section>
  );
}
