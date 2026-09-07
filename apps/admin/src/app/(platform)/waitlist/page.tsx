"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { CreateTenantModal } from "@/components/tenants/CreateTenantModal";
import api from "@/lib/api";
import { cn } from "@/lib/utils";

type WaitlistStatus = "pending" | "contacted" | "activated" | "declined";
type SizeRange = "ate_50" | "ate_150" | "ate_300" | "acima_300";

interface Subscriber {
  id: string;
  email: string;
  pastor_name: string;
  church_name: string | null;
  city: string | null;
  state: string | null;
  size_range: SizeRange;
  status: WaitlistStatus;
  source: string | null;
  created_at: string;
  tenant_id: string | null;
}

const STATUS_LABELS: Record<WaitlistStatus, string> = {
  pending: "Pendente",
  contacted: "Contatado",
  activated: "Ativado",
  declined: "Recusado",
};

const STATUS_CLS: Record<WaitlistStatus, string> = {
  pending: "bg-[var(--surface-subtle)] text-stone",
  contacted: "bg-navy-dim text-navy",
  activated: "bg-teal-dim text-teal",
  declined: "bg-crimson-dim text-crimson",
};

const SIZE_LABELS: Record<SizeRange, string> = {
  ate_50: "até 50",
  ate_150: "até 150",
  ate_300: "até 300",
  acima_300: "acima de 300",
};

const STATUS_TABS: { value: "" | WaitlistStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "pending", label: "Pendentes" },
  { value: "contacted", label: "Contatados" },
  { value: "activated", label: "Ativados" },
  { value: "declined", label: "Recusados" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * A lista em si segue somente leitura — não há seletor de status aqui.
 *
 * O que existe é "Provisionar": abre o mesmo modal de `tenants/`, prefiller
 * com os dados do lead, e a API ativa o lead (`status`, `activated_at`,
 * `tenant_id`) dentro da mesma transação que cria o tenant. Ligar um seletor
 * de status direto nesta tabela seria meia-medida — `tenant_id` continuaria
 * nulo, e a tela passaria a impressão contrária. Decisão registrada em
 * `docs/PENDENCIAS.md`.
 */
export default function WaitlistPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"" | WaitlistStatus>("");
  const [error, setError] = useState("");
  const [provisioning, setProvisioning] = useState<Subscriber | null>(null);

  // Cancelamento por request, não só por filtro: alternar as abas rápido
  // (Pendentes → Ativados → Pendentes) dispara três requisições, e sem isto a
  // que responder por último decide a tela — mesmo sendo a de uma aba que já
  // não está mais selecionada. `isLoading` derivado de "esta busca já
  // terminou" pelo mesmo motivo de `tenants/page.tsx`: setState direto no
  // corpo do efeito dispara render em cascata.
  const [reloadTick, setReloadTick] = useState(0);
  const requestKey = `${status}|${reloadTick}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const isLoading = loadedKey !== requestKey;

  useEffect(() => {
    const signal = { cancelled: false };
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    api
      .get<{ data: Subscriber[]; total: number }>(`/admin/waitlist?${params}`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setSubscribers(data.data);
        setTotal(data.total);
        setError("");
      })
      .catch(() => {
        if (signal.cancelled) return;
        setSubscribers([]);
        setTotal(0);
        setError("Não foi possível carregar a waitlist.");
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(requestKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [requestKey, status]);

  function handleStatus(next: "" | WaitlistStatus) {
    if (next === status) return;
    setStatus(next);
  }

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const columns: Column<Subscriber>[] = [
    {
      key: "pastor",
      header: "Contato",
      render: (s) => (
        <div className="flex flex-col">
          <span className="font-medium text-ink dark:text-white">
            {s.pastor_name}
          </span>
          <span className="text-xs text-stone">{s.email}</span>
        </div>
      ),
    },
    {
      key: "church",
      header: "Igreja",
      render: (s) => (
        <div className="flex flex-col">
          <span className="text-sm text-ink dark:text-white">
            {s.church_name ?? "—"}
          </span>
          <span className="text-xs text-stone">
            {[s.city, s.state].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "size",
      header: "Tamanho",
      width: "130px",
      render: (s) => (
        <span className="text-sm text-stone">{SIZE_LABELS[s.size_range]}</span>
      ),
    },
    {
      key: "source",
      header: "Origem",
      width: "120px",
      render: (s) => (
        <span className="text-sm text-stone">{s.source ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: "120px",
      render: (s) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            STATUS_CLS[s.status]
          )}
        >
          {STATUS_LABELS[s.status]}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Entrou em",
      width: "120px",
      render: (s) => (
        <span className="text-sm text-stone">{fmtDate(s.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "150px",
      render: (s) =>
        s.tenant_id ? (
          <span className="text-xs text-stone">Já provisionado</span>
        ) : (
          <button
            type="button"
            onClick={() => setProvisioning(s)}
            title="Cria o tenant a partir deste lead e marca a waitlist como ativada."
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border-default)] px-2.5 py-1.5 text-xs font-medium text-navy transition-colors hover:bg-navy/10"
          >
            <UserPlus size={14} strokeWidth={1.5} />
            Provisionar
          </button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-medium text-ink dark:text-white">Waitlist</h1>
        <p className="text-sm text-stone">
          Leads do site. {total} inscrito{total === 1 ? "" : "s"}
          {status ? ` em "${STATUS_LABELS[status]}"` : ""}.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value || "all"}
            type="button"
            onClick={() => handleStatus(tab.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              status === tab.value
                ? "bg-navy text-white"
                : "bg-[var(--surface-subtle)] text-stone hover:text-ink dark:hover:text-white"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={subscribers}
        getRowKey={(s) => s.id}
        isLoading={isLoading}
        error={error || undefined}
        onRetry={reload}
        emptyState="Nenhum inscrito com este filtro."
      />

      <CreateTenantModal
        key={provisioning?.id ?? "none"}
        open={provisioning !== null}
        onOpenChange={(open) => {
          if (!open) setProvisioning(null);
        }}
        onCreated={reload}
        lead={provisioning}
      />
    </div>
  );
}
