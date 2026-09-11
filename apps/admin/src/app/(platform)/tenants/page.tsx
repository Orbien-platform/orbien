"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Pencil, Plus } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SearchInput } from "@/components/ui/SearchInput";
import { Modal } from "@/components/ui/Modal";
import { CreateTenantModal } from "@/components/tenants/CreateTenantModal";
import { EditTenantModal } from "@/components/tenants/EditTenantModal";
import { openSupportSession } from "@/lib/support-session";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  email: string | null;
  plan: "starter" | "premium" | null;
  plan_status: "trial" | "active" | "past_due" | "canceled" | null;
  trial_ends_at: string | null;
  is_active: boolean;
  congregations_count: number;
  created_at: string;
}

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  premium: "Premium",
};

const STATUS_LABELS: Record<string, string> = {
  trial: "Trial",
  active: "Ativo",
  past_due: "Em atraso",
  canceled: "Cancelado",
};

const STATUS_CLS: Record<string, string> = {
  trial: "bg-navy-dim text-navy",
  active: "bg-teal-dim text-teal",
  past_due: "bg-crimson-dim text-crimson",
  canceled: "bg-[var(--surface-subtle)] text-stone",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // Duas fontes de erro distintas: uma é "a lista não carregou" (vai na
  // tabela, ao lado do resultado que ela substitui), a outra é "a ação numa
  // linha falhou" (vai no banner, porque a lista continua válida ao lado
  // dela). Um `error` só faria a tabela sumir por causa de um clique.
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");

  // Mesmo desenho de `apps/web/src/app/(admin)/pessoas/page.tsx`, e pelo mesmo
  // motivo. `isLoading` como estado imperativo travava a tela: o `SearchInput`
  // dispara `onSearch` no próprio mount depois do debounce, e com o termo igual
  // ao atual o `setSearch` não muda nada — o effect não rodava de novo e nada
  // voltava a desligar o loading. Derivado de "qual requisição já terminou",
  // isso não tem como acontecer.
  const [reloadTick, setReloadTick] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const requestKey = `${search}|${reloadTick}`;
  const isLoading = loadedKey !== requestKey;

  // Qual linha está abrindo sessão de suporte — o spinner é por tenant, não da
  // tela: a lista continua utilizável enquanto o `impersonate` responde.
  const [openingFor, setOpeningFor] = useState<string | null>(null);

  // Tenant sendo editado no momento — `null` fecha o modal. Guardado inteiro
  // (não só o id) para o `EditTenantModal` ter o que prefiller sem outro round-trip.
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Tenant no meio da confirmação de ativar/inativar — separado de
  // `editingTenant` porque os dois modais podem existir ao mesmo tempo que a
  // tabela, mas nunca um por cima do outro.
  const [toggleTarget, setToggleTarget] = useState<Tenant | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  // O cancelamento evita que uma resposta antiga sobreescreva a lista: digitar
  // "doca" e apagar rápido deixa duas requisições em voo, e sem isto a
  // primeira a chegar por último ganha.
  useEffect(() => {
    const signal = { cancelled: false };
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("search", search);
    api
      .get<{ data: Tenant[] }>(`/platform/tenants?${params}`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setTenants(data.data);
        setLoadError("");
      })
      .catch(() => {
        if (signal.cancelled) return;
        setTenants([]);
        setLoadError("Não foi possível carregar os tenants.");
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(requestKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [requestKey, search]);

  // Estável de propósito: o effect do `SearchInput` tem `onSearch` nas
  // dependências, e uma identidade nova a cada render reagenda o debounce sem
  // parar.
  const handleSearch = useCallback((term: string) => setSearch(term), []);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  async function handleSupportSession(tenant: Tenant) {
    setActionError("");
    setOpeningFor(tenant.id);
    try {
      await openSupportSession(tenant.id, tenant.name);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        // `impersonate` exige uma congregação: o token precisa fixar
        // `congregation_id`, e sem ela não há sessão possível.
        setActionError(
          `${tenant.name} não tem congregação — não é possível abrir sessão de suporte.`
        );
      } else if (!axios.isAxiosError(err) && err instanceof Error) {
        // Não veio da API: é o erro de configuração que `openSupportSession`
        // lança quando `NEXT_PUBLIC_WEB_URL` não está definida. A mensagem
        // nomeia a variável, e engoli-la transformava uma correção de um
        // minuto no painel em tentativa e erro.
        setActionError(err.message);
      } else {
        setActionError("Não foi possível abrir a sessão de suporte.");
      }
    } finally {
      setOpeningFor(null);
    }
  }

  async function handleToggleActive() {
    if (!toggleTarget) return;
    setActionError("");
    setIsToggling(true);
    try {
      const action = toggleTarget.is_active ? "deactivate" : "activate";
      await api.patch(`/platform/tenants/${toggleTarget.id}/${action}`);
      setToggleTarget(null);
      reload();
    } catch {
      // Fecha o modal antes de mostrar o erro: o banner vive no corpo da
      // página, e o modal aberto o deixaria atrás de um `aria-hidden` — como
      // se o erro nunca tivesse aparecido.
      setToggleTarget(null);
      setActionError(
        toggleTarget.is_active
          ? `Não foi possível inativar ${toggleTarget.name}.`
          : `Não foi possível reativar ${toggleTarget.name}.`
      );
    } finally {
      setIsToggling(false);
    }
  }

  const columns: Column<Tenant>[] = [
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
      key: "plan",
      header: "Plano",
      width: "160px",
      render: (t) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-ink dark:text-white">
            {t.plan ? PLAN_LABELS[t.plan] : "—"}
          </span>
          {t.plan_status && (
            <span
              className={cn(
                "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_CLS[t.plan_status]
              )}
            >
              {STATUS_LABELS[t.plan_status]}
            </span>
          )}
        </div>
      ),
    },
    {
      // Rótulo "Habilitado/Bloqueado" de propósito, não "Ativo/Inativo" — a
      // coluna de plano já usa "Ativo" para `plan_status`, e as duas colunas
      // lado a lado com o mesmo texto para coisas diferentes confundiria tanto
      // quem lê a tela quanto um `getByText` no teste.
      key: "is_active",
      header: "Acesso",
      width: "110px",
      render: (t) => (
        <span
          className={cn(
            "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium",
            t.is_active ? "bg-teal-dim text-teal" : "bg-crimson-dim text-crimson"
          )}
        >
          {t.is_active ? "Habilitado" : "Bloqueado"}
        </span>
      ),
    },
    {
      key: "congregations",
      header: "Congregações",
      width: "130px",
      render: (t) => (
        <span className="text-sm text-stone">{t.congregations_count}</span>
      ),
    },
    {
      key: "created_at",
      header: "Criado em",
      width: "120px",
      render: (t) => (
        <span className="text-sm text-stone">{fmtDate(t.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "330px",
      render: (t) => (
        <div className="flex items-center gap-1.5">
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
          <button
            type="button"
            onClick={() => setEditingTenant(t)}
            title="Editar nome e contato do tenant"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-default)] px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-[var(--surface-subtle)] dark:text-white"
          >
            <Pencil size={14} strokeWidth={1.5} />
            Editar
          </button>
          <button
            type="button"
            onClick={() => setToggleTarget(t)}
            title={t.is_active ? "Inativar este tenant" : "Reativar este tenant"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-xs font-medium transition-colors",
              t.is_active
                ? "border-[var(--border-default)] text-crimson hover:bg-crimson-dim"
                : "border-[var(--border-default)] text-teal hover:bg-teal-dim"
            )}
          >
            {t.is_active ? "Inativar" : "Reativar"}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-medium text-ink dark:text-white">Tenants</h1>
          <p className="text-sm text-stone">
            Todas as igrejas da plataforma. {tenants.length} listada
            {tenants.length === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SearchInput
            placeholder="Buscar por nome ou slug…"
            onSearch={handleSearch}
            className="w-[240px]"
          />
          <Button
            onClick={() => setCreateOpen(true)}
            className="h-8 rounded-[8px] bg-navy px-3 text-sm font-medium text-white hover:bg-[var(--color-navy-dark)]"
          >
            <Plus size={15} strokeWidth={1.5} className="mr-1.5" />
            Novo tenant
          </Button>
        </div>
      </div>

      {actionError && (
        <p
          className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson"
          role="alert"
        >
          {actionError}
        </p>
      )}

      <DataTable
        columns={columns}
        rows={tenants}
        getRowKey={(t) => t.id}
        isLoading={isLoading}
        error={loadError || undefined}
        onRetry={reload}
        emptyState={
          search
            ? "Nenhum tenant corresponde à busca."
            : "Nenhum tenant na plataforma ainda."
        }
      />

      <CreateTenantModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={reload}
      />

      <EditTenantModal
        key={editingTenant?.id}
        open={editingTenant !== null}
        onOpenChange={(next) => {
          if (!next) setEditingTenant(null);
        }}
        onUpdated={reload}
        tenant={editingTenant}
      />

      <Modal
        open={toggleTarget !== null}
        onOpenChange={(next) => {
          if (!next && !isToggling) setToggleTarget(null);
        }}
        title={toggleTarget?.is_active ? "Inativar tenant?" : "Reativar tenant?"}
        description={
          toggleTarget?.is_active
            ? `Ninguém em ${toggleTarget?.name} vai conseguir entrar até reativar. Sessões já abertas caem na próxima requisição.`
            : `Contas de ${toggleTarget?.name} voltam a conseguir entrar normalmente.`
        }
        className="max-w-sm"
      >
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setToggleTarget(null)}
            disabled={isToggling}
            className="rounded-[8px] px-3 py-2 text-sm font-medium text-stone transition-colors hover:bg-[var(--surface-subtle)] hover:text-ink dark:hover:text-white disabled:opacity-60"
          >
            Cancelar
          </button>
          <Button
            onClick={handleToggleActive}
            disabled={isToggling}
            className={cn(
              "h-9 rounded-[8px] px-4 text-sm font-medium text-white disabled:opacity-60",
              toggleTarget?.is_active
                ? "bg-crimson hover:opacity-90"
                : "bg-navy hover:bg-[var(--color-navy-dark)]"
            )}
          >
            {isToggling ? (
              <Loader2 size={15} className="animate-spin" />
            ) : toggleTarget?.is_active ? (
              "Inativar"
            ) : (
              "Reativar"
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
