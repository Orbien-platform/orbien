"use client";

import { useEffect, useState } from "react";
import { Loader2, Home, Phone, Mail } from "lucide-react";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";

export interface VisitRequest {
  id: string;
  visitor_name: string;
  visitor_phone?: string | null;
  visitor_email?: string | null;
  message?: string | null;
  created_at: string;
}

function formatDate(iso: string): string {
  return formatInstant(iso, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Pedidos de visita vindos do "Encontre uma célula" (PROD-13/PROD-23) — o
 * lado que o líder abre.
 *
 * `GET /small-groups/:id/visit-requests` devolve quem pediu para visitar a
 * célula pela página pública `/celulas/[tenant_slug]`: nome, contato e
 * mensagem, mais recente primeiro. Mesmos `ALERT_ROLES` de
 * `:id/absence-alerts`, então o 403 recebe o mesmo tratamento do
 * `AbsenceAlertsPanel`: quem perder o papel entre o carregamento da página e
 * o clique precisa ler "sem acesso", não "ninguém pediu para visitar".
 */
export function VisitRequestsPanel({ groupId }: { groupId: string }) {
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");

  // Mesmo padrão dos outros painéis: "carregando" é derivado de qual
  // requisição já terminou, nunca um setState no corpo do effect.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const loading = loadedKey !== groupId;

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<VisitRequest[]>(`/small-groups/${groupId}/visit-requests`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        setRequests(data);
        setForbidden(false);
        setError("");
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setRequests([]);
        if (isForbidden(err)) {
          setForbidden(true);
          setError("");
        } else {
          setForbidden(false);
          setError("Não foi possível carregar os pedidos de visita.");
        }
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(groupId);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [groupId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10" data-testid="visit-requests-loading">
        <Loader2 size={20} className="animate-spin text-stone" />
      </div>
    );
  }

  if (forbidden) return <NoAccessState resource="os pedidos de visita desta célula" />;

  if (error) {
    return (
      <p role="alert" className="px-4 py-3 text-sm text-crimson">
        {error}
      </p>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <Home size={24} strokeWidth={1.5} className="text-stone" />
        <p className="text-sm text-stone">
          Ninguém pediu para visitar esta célula ainda.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <p className="border-b border-[var(--border-default)] px-4 py-3 text-xs text-stone">
        Pedidos de visita feitos pela página pública &ldquo;Encontre uma
        célula&rdquo;, mais recentes primeiro.
      </p>
      <ul className="divide-y divide-[var(--border-default)]">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink dark:text-white">{r.visitor_name}</span>
              <span className="text-xs text-stone">{formatDate(r.created_at)}</span>
            </div>
            {/* Telefone e e-mail viram link: o líder precisa conseguir
                responder ao pedido sem sair da tela. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone">
              {r.visitor_phone && (
                <a
                  href={`tel:${r.visitor_phone}`}
                  className="flex items-center gap-1 hover:text-ink dark:hover:text-white"
                >
                  <Phone size={12} strokeWidth={1.5} />
                  {r.visitor_phone}
                </a>
              )}
              {r.visitor_email && (
                <a
                  href={`mailto:${r.visitor_email}`}
                  className="flex items-center gap-1 hover:text-ink dark:hover:text-white"
                >
                  <Mail size={12} strokeWidth={1.5} />
                  {r.visitor_email}
                </a>
              )}
              {!r.visitor_phone && !r.visitor_email && <span>Sem contato informado</span>}
            </div>
            {r.message && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink dark:text-white">
                {r.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
