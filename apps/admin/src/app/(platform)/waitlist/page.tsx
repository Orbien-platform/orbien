"use client";

import { useCallback, useEffect, useState } from "react";
import { DataTable, type Column } from "@/components/ui/DataTable";
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
 * Somente leitura, de propósito. `PATCH /admin/waitlist/:id` existe e move o
 * status (e preenche `contacted_at` / `activated_at`), mas mudar o estado de um
 * lead é decisão comercial, não de plataforma — entra quando alguém for de
 * fato trabalhar a lista por aqui.
 */
export default function WaitlistPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<"" | WaitlistStatus>("");
  const [error, setError] = useState("");

  const load = useCallback((filter: "" | WaitlistStatus) => {
    const params = new URLSearchParams({ limit: "100" });
    if (filter) params.set("status", filter);
    return api
      .get<{ data: Subscriber[]; total: number }>(`/admin/waitlist?${params}`)
      .then(({ data }) => {
        setSubscribers(data.data);
        setTotal(data.total);
        setError("");
      })
      .catch(() => {
        setSubscribers([]);
        setTotal(0);
        setError("Não foi possível carregar a waitlist.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load(status);
  }, [load, status]);

  function handleStatus(next: "" | WaitlistStatus) {
    if (next === status) return;
    setIsLoading(true);
    setStatus(next);
  }

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
        rows={subscribers}
        getRowKey={(s) => s.id}
        isLoading={isLoading}
        emptyState="Nenhum inscrito com este filtro."
      />
    </div>
  );
}
