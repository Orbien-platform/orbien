"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

type PlatformAction = "support_access" | "platform_access";

interface AuditEntry {
  id: string;
  at: string;
  action: PlatformAction;
  entity: string;
  tenant_id: string;
  tenant_name: string;
  actor_user_id: string;
  actor_email: string | null;
  ip: string | null;
}

const ACTION_LABELS: Record<PlatformAction, string> = {
  support_access: "Sessão de suporte",
  platform_access: "Rota de plataforma",
};

const ACTION_CLS: Record<PlatformAction, string> = {
  support_access: "bg-crimson-dim text-crimson",
  platform_access: "bg-navy-dim text-navy",
};

const ACTION_TABS: { value: "" | PlatformAction; label: string }[] = [
  { value: "", label: "Tudo" },
  { value: "support_access", label: "Sessões de suporte" },
  { value: "platform_access", label: "Rotas de plataforma" },
];

const PERIODOS = [
  { dias: 1, label: "24 horas" },
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 0, label: "Tudo" },
];

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function desdeISO(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

/**
 * O rastro que a plataforma deixa de si mesma.
 *
 * O `AuditInterceptor` grava `support_access` e `platform_access` desde a Fase
 * 2 e ninguém nunca olhou — não havia como. A `tenant_read` de 001 dizia
 * `tenant_id = app_current_tenant()`, e rota de plataforma roda sem tenant no
 * contexto; quem abriu o caminho foi `005_rls_audit_platform.sql`.
 *
 * Somente leitura, e vai continuar: auditoria que a própria plataforma edita
 * não é auditoria. Não há ação nenhuma nesta tela de propósito.
 *
 * **Lista vazia aqui merece desconfiança, não conclusão.** Se 005 não tiver
 * rodado no banco, o ramo de plataforma não existe e a consulta devolve zero
 * linhas sem erro nenhum — o mesmo modo de falha silenciosa que 004 já tinha.
 * Por isso o estado vazio diz isso em vez de "nada aconteceu".
 */
export default function AuditoriaPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<"" | PlatformAction>("");
  const [dias, setDias] = useState(7);
  const [error, setError] = useState("");

  const load = useCallback((filtro: "" | PlatformAction, janela: number) => {
    const params = new URLSearchParams({ limit: "100" });
    if (filtro) params.set("action", filtro);
    if (janela > 0) params.set("from", desdeISO(janela));

    return api
      .get<{ data: AuditEntry[]; total: number }>(`/platform/audit?${params}`)
      .then(({ data }) => {
        setEntries(data.data);
        setTotal(data.total);
        setError("");
      })
      .catch(() => {
        setEntries([]);
        setTotal(0);
        setError("Não foi possível carregar a auditoria.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load(action, dias);
  }, [load, action, dias]);

  function handleAction(next: "" | PlatformAction) {
    if (next === action) return;
    setIsLoading(true);
    setAction(next);
  }

  function handlePeriodo(next: number) {
    if (next === dias) return;
    setIsLoading(true);
    setDias(next);
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: "at",
      header: "Quando",
      width: "140px",
      render: (e) => (
        <span className="text-sm tabular-nums text-stone">{fmtDateTime(e.at)}</span>
      ),
    },
    {
      key: "action",
      header: "O quê",
      width: "170px",
      render: (e) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            ACTION_CLS[e.action]
          )}
        >
          {ACTION_LABELS[e.action]}
        </span>
      ),
    },
    {
      key: "tenant",
      header: "Igreja",
      render: (e) => (
        <span className="text-sm text-ink dark:text-white">{e.tenant_name}</span>
      ),
    },
    {
      key: "actor",
      header: "Quem",
      render: (e) => (
        <span className="text-sm text-stone">
          {e.actor_email ?? e.actor_user_id}
        </span>
      ),
    },
    {
      key: "entity",
      header: "Onde",
      width: "150px",
      render: (e) => (
        <span className="font-mono text-xs text-stone">{e.entity}</span>
      ),
    },
    {
      key: "ip",
      header: "IP",
      width: "130px",
      render: (e) => (
        <span className="font-mono text-xs text-stone">{e.ip ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium text-ink dark:text-white">Auditoria</h1>
        <p className="text-sm text-stone">
          Todo acesso que a plataforma fez às igrejas. {total} registro
          {total === 1 ? "" : "s"} no período.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          {ACTION_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              onClick={() => handleAction(tab.value)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                action === tab.value
                  ? "bg-navy text-white"
                  : "bg-[var(--surface-subtle)] text-stone hover:text-ink dark:hover:text-white"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => handlePeriodo(p.dias)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                dias === p.dias
                  ? "bg-navy text-white"
                  : "bg-[var(--surface-subtle)] text-stone hover:text-ink dark:hover:text-white"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p
          className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson"
          role="alert"
        >
          {error}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={entries}
        getRowKey={(e) => e.id}
        isLoading={isLoading}
        emptyState={
          <span>
            Nenhum acesso da plataforma neste período.
            <br />
            <span className="text-xs">
              Se você esperava registros, confirme que{" "}
              <code className="font-mono">005_rls_audit_platform.sql</code> foi
              aplicado — sem ele a consulta volta vazia sem erro.
            </span>
          </span>
        }
      />
    </div>
  );
}
