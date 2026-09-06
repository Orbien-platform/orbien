"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import api from "@/lib/api";

interface AuditLogRow {
  id: string;
  at: string;
  tenant_id: string;
  tenant_slug: string | null;
  tenant_name: string | null;
  actor_user_id: string;
  actor_email: string | null;
  route: string;
  method: string | null;
  status: number | null;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Somente leitura — nem faria sentido escrever aqui. `audit_logs` só aceita
 * INSERT via `audit_insert()` (SECURITY DEFINER); o que esta tela expõe é o
 * rastro que o `AuditInterceptor` grava desde a Fase 1 em toda requisição de
 * sessão de suporte, e que até a Fase 5 ninguém tinha olhado.
 *
 * O filtro por `action: 'support_access'` é fixo no backend
 * (`GET /platform/audit-logs/support-access`), não um parâmetro — esta tela
 * responde uma pergunta só.
 */
export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  // Mesmo desenho de `tenants/page.tsx`: `isLoading` derivado de "esta busca
  // já terminou" em vez de estado imperativo, para não chamar `setState`
  // dentro do próprio corpo do efeito.
  const [reloadTick, setReloadTick] = useState(0);
  const [loadedTick, setLoadedTick] = useState<number | null>(null);
  const isLoading = loadedTick !== reloadTick;
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<{ data: AuditLogRow[]; total: number }>(
        "/platform/audit-logs/support-access?limit=100"
      )
      .then(({ data }) => {
        if (signal.cancelled) return;
        setLogs(data.data);
        setTotal(data.total);
        setError("");
      })
      .catch(() => {
        if (signal.cancelled) return;
        setLogs([]);
        setTotal(0);
        setError("Não foi possível carregar a auditoria de sessões de suporte.");
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedTick(reloadTick);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [reloadTick]);

  const columns: Column<AuditLogRow>[] = [
    {
      key: "at",
      header: "Quando",
      width: "150px",
      render: (l) => <span className="text-sm text-stone">{fmtDateTime(l.at)}</span>,
    },
    {
      key: "actor",
      header: "Suporte",
      render: (l) => (
        <span className="text-sm text-ink dark:text-white">
          {l.actor_email ?? l.actor_user_id}
        </span>
      ),
    },
    {
      key: "tenant",
      header: "Igreja",
      render: (l) => (
        <div className="flex flex-col">
          <span className="text-sm text-ink dark:text-white">
            {l.tenant_name ?? "—"}
          </span>
          <span className="font-mono text-xs text-stone">
            {l.tenant_slug ?? l.tenant_id}
          </span>
        </div>
      ),
    },
    {
      key: "route",
      header: "Rota",
      render: (l) => (
        <span className="font-mono text-xs text-stone">
          {l.method ? `${l.method} ` : ""}
          {l.route}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "90px",
      render: (l) => (
        <span className="text-sm text-stone">{l.status ?? "—"}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium text-ink dark:text-white">
          Auditoria de suporte
        </h1>
        <p className="text-sm text-stone">
          Toda requisição feita em sessão de suporte (impersonação), mais
          recente primeiro. {total} registro{total === 1 ? "" : "s"}.
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={logs}
        getRowKey={(l) => l.id}
        isLoading={isLoading}
        error={error || undefined}
        onRetry={reload}
        emptyState="Nenhuma sessão de suporte registrada ainda."
      />
    </div>
  );
}
