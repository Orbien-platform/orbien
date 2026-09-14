"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  at: string;
  action: string;
  entity: string;
  congregation_id: string | null;
  actor_user_id: string;
  actor_name: string | null;
  route: string | null;
  method: string | null;
  status: number | null;
}

interface AuditLogsResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 20;

/**
 * As duas ações que a API devolve para o tenant, com o nome que a igreja usa.
 * `platform_access` não entra aqui porque não sai de lá — ver
 * `ListTenantAuditLogsQueryDto`.
 */
const ACTION_LABELS: Record<string, string> = {
  support_access: "Acesso do suporte",
  tenant_transfer: "Transferência de conta",
};

function formatWhen(iso: string): string {
  return formatInstant(iso, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * O que a linha diz ter acontecido.
 *
 * Em `support_access` o que importa é a rota tocada, com o método — é o
 * rastro de uma requisição. Em `tenant_transfer` a `entity` já é o assunto
 * (`user_account`) e não há rota nenhuma para mostrar.
 */
function describeLog(log: AuditLog): string {
  if (log.action === "support_access") {
    const path = log.route ?? log.entity;
    return log.method ? `${log.method} ${path}` : path;
  }
  if (log.action === "tenant_transfer") return "Conta de usuário transferida";
  return log.entity;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * `PROD-21` — a igreja lê a própria auditoria.
 *
 * A mesma tabela que o console da plataforma lê em `apps/admin`, pela
 * pergunta oposta: lá é "o que o suporte fez, e em qual igreja"; aqui é "quem
 * mexeu na minha igreja". Quem recorta as linhas é o RLS — esta tela não
 * manda tenant nenhum, só filtro.
 *
 * É a contrapartida visível do `SupportSessionBanner`: a faixa avisa enquanto
 * a sessão de suporte acontece, esta tela responde depois. Só `tenant_admin`,
 * e só no Premium (`GET /audit-logs`) — quem não alcança nem vê o link na
 * barra lateral, e quem chega pela URL recebe o 403 que vira "sem acesso".
 */
export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [reloadTick, setReloadTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${page}|${action}|${from}|${to}|${reloadTick}`;
  const isLoading = loadedKey !== requestKey;

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // Mesmo padrão das demais telas: `useEffect` + axios, cadeia de promises
  // (todo setState dentro de callback) e cancelamento por closure, para uma
  // resposta antiga não sobrescrever a lista quando o filtro muda antes.
  useEffect(() => {
    const signal = { cancelled: false };
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api
      .get<AuditLogsResponse>(`/audit-logs?${params}`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setLogs(data.data);
        setTotal(data.total);
        setAccessDenied(false);
        setLoadError(false);
      })
      .catch((error) => {
        if (signal.cancelled) return;
        setLogs([]);
        setTotal(0);
        // 403 não é lista vazia, e falha de rede também não: sem separar os
        // três, "o suporte nunca entrou aqui" fica indistinguível de "a
        // requisição não voltou".
        setAccessDenied(isForbidden(error));
        setLoadError(!isForbidden(error));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(requestKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [requestKey, page, action, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = Boolean(action || from || to);

  const columns: Column<AuditLog>[] = [
    {
      key: "at",
      header: "Quando",
      width: "160px",
      render: (row) => <span className="text-stone">{formatWhen(row.at)}</span>,
    },
    {
      key: "actor",
      header: "Quem",
      width: "200px",
      render: (row) => (
        <span className="font-medium text-ink dark:text-white">
          {/* Nome congelado no momento do registro: a conta pode já não
              existir nesta igreja — é justamente o caso da transferência. */}
          {row.actor_name ?? "Conta removida"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Ação",
      width: "180px",
      render: (row) => (
        <span className="text-stone">{ACTION_LABELS[row.action] ?? row.action}</span>
      ),
    },
    {
      key: "what",
      header: "O quê",
      render: (row) => (
        <span className="font-mono text-xs text-stone">
          {describeLog(row)}
          {row.status !== null && <span className="ml-2">({row.status})</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div>
        <h1 className="text-lg font-medium text-ink dark:text-white">Auditoria</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-stone">
          Todo acesso da equipe de suporte da Orbien aos dados desta igreja fica
          registrado aqui, junto com as transferências de conta entre igrejas.
          {total > 0 && ` ${total} registro${total !== 1 ? "s" : ""}.`}
        </p>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="Filtrar por ação"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
        >
          <option value="">Todas as ações</option>
          <option value="support_access">Acesso do suporte</option>
          <option value="tenant_transfer">Transferência de conta</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-stone">
          De
          <input
            type="date"
            aria-label="Data inicial"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone">
          até
          <input
            type="date"
            aria-label="Data final"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setAction("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
            className="text-sm text-navy underline-offset-2 hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── Table ── */}
      <DataTable
        columns={columns}
        rows={logs}
        getRowKey={(l) => l.id}
        isLoading={isLoading}
        error={loadError ? "Não foi possível carregar a auditoria." : undefined}
        onRetry={loadError ? reload : undefined}
        emptyState={
          accessDenied ? (
            <NoAccessState resource="Auditoria" />
          ) : hasFilters ? (
            "Nenhum registro com esses filtros."
          ) : (
            "Nenhum acesso registrado até agora."
          )
        }
      />

      {/* ── Pagination ── */}
      {!isLoading && total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-stone">
          <span>
            {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} de {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px]"
              aria-label="Página anterior"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft size={14} />
            </Button>
            <span className="px-2 text-xs">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-[8px]"
              aria-label="Próxima página"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
