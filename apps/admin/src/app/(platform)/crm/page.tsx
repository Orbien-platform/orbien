"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import axios from "axios";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { openSupportSession } from "@/lib/support-session";
import api from "@/lib/api";

/**
 * PROD-06 — fila de CRM: trials não convertidos e tenants inadimplentes.
 *
 * Lê `GET /platform/tenants/crm-queue`, que já separa as duas listas no
 * backend (`ListCrmQueueService`) — aqui só renderiza. Cada linha reaproveita
 * `openSupportSession` (mesma ação da tela de Tenants) para o time comercial
 * poder entrar no tenant e ver o estado real antes de contatar.
 */

interface CrmQueueItem {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  plan: "starter" | "premium" | null;
  plan_status: "trial" | "active" | "suspended" | "cancelled" | null;
  trial_ends_at: string | null;
  created_at: string;
}

interface CrmQueue {
  trials_expirados: CrmQueueItem[];
  inadimplentes: CrmQueueItem[];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function CrmPage() {
  const [queue, setQueue] = useState<CrmQueue>({ trials_expirados: [], inadimplentes: [] });
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [openingFor, setOpeningFor] = useState<string | null>(null);

  // Mesmo desenho de `apps/admin/.../tenants/page.tsx`: `isLoading` derivado
  // de "a requisição desta rodada já terminou" em vez de estado imperativo.
  const [reloadTick, setReloadTick] = useState(0);
  const [loadedTick, setLoadedTick] = useState<number | null>(null);
  const isLoading = loadedTick !== reloadTick;

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<CrmQueue>("/platform/tenants/crm-queue")
      .then(({ data }) => {
        if (signal.cancelled) return;
        setQueue(data);
        setLoadError("");
      })
      .catch(() => {
        if (signal.cancelled) return;
        setQueue({ trials_expirados: [], inadimplentes: [] });
        setLoadError("Não foi possível carregar a fila.");
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedTick(reloadTick);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [reloadTick]);

  async function handleSupportSession(tenant: CrmQueueItem) {
    setActionError("");
    setOpeningFor(tenant.id);
    try {
      await openSupportSession(tenant.id, tenant.name);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setActionError(
          `${tenant.name} não tem congregação — não é possível abrir sessão de suporte.`
        );
      } else if (!axios.isAxiosError(err) && err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError("Não foi possível abrir a sessão de suporte.");
      }
    } finally {
      setOpeningFor(null);
    }
  }

  function columnsFor(kind: "trial" | "inadimplente"): Column<CrmQueueItem>[] {
    return [
      {
        key: "name",
        header: "Igreja",
        render: (t) => (
          <div className="flex flex-col">
            <span className="font-medium text-ink dark:text-white">{t.name}</span>
            <span className="font-mono text-xs text-stone">{t.slug}</span>
          </div>
        ),
      },
      {
        key: "email",
        header: "Contato",
        render: (t) => <span className="text-sm text-stone">{t.email ?? "—"}</span>,
      },
      ...(kind === "trial"
        ? [
            {
              key: "trial_ends_at",
              header: "Trial venceu em",
              width: "140px",
              render: (t: CrmQueueItem) => (
                <span className="text-sm text-stone">{fmtDate(t.trial_ends_at)}</span>
              ),
            } satisfies Column<CrmQueueItem>,
          ]
        : []),
      {
        key: "created_at",
        header: "Cliente desde",
        width: "130px",
        render: (t) => <span className="text-sm text-stone">{fmtDate(t.created_at)}</span>,
      },
      {
        key: "actions",
        header: "",
        width: "220px",
        render: (t) => (
          <button
            type="button"
            onClick={() => handleSupportSession(t)}
            disabled={openingFor !== null}
            title="Abre o app do tenant numa aba nova, com as permissões deste tenant. Cada requisição fica registrada em audit_logs."
            className="inline-flex items-center gap-2 rounded-[8px] border border-[var(--border-default)] px-2.5 py-1.5 text-xs font-medium text-navy transition-colors hover:bg-navy/10 disabled:opacity-50"
          >
            {openingFor === t.id ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ExternalLink size={14} strokeWidth={1.5} />
            )}
            Entrar no web como suporte
          </button>
        ),
      },
    ];
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-medium text-ink dark:text-white">CRM</h1>
        <p className="text-sm text-stone">
          Trials não convertidos e tenants inadimplentes, para follow-up comercial.
        </p>
      </div>

      {actionError && (
        <p
          className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink dark:text-white">
          Trial vencido sem conversão ({queue.trials_expirados.length})
        </h2>
        <DataTable
          columns={columnsFor("trial")}
          rows={queue.trials_expirados}
          getRowKey={(t) => t.id}
          isLoading={isLoading}
          error={loadError || undefined}
          onRetry={reload}
          emptyState="Nenhum trial vencido sem conversão."
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-ink dark:text-white">
          Inadimplentes ({queue.inadimplentes.length})
        </h2>
        <DataTable
          columns={columnsFor("inadimplente")}
          rows={queue.inadimplentes}
          getRowKey={(t) => t.id}
          isLoading={isLoading}
          error={loadError || undefined}
          onRetry={reload}
          emptyState="Nenhum tenant inadimplente."
        />
      </section>
    </div>
  );
}
