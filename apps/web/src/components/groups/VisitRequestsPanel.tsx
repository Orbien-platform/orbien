"use client";

import { useEffect, useState } from "react";
import { Loader2, HandHeart, Mail, Phone } from "lucide-react";
import { NoAccessState } from "@/components/ui/NoAccessState";
import api, { isForbidden } from "@/lib/api";
import { formatInstant } from "@/lib/datetime";

export interface VisitRequest {
  id: string;
  visitor_name: string;
  visitor_phone: string | null;
  visitor_email: string | null;
  message: string | null;
  created_at: string;
}

/**
 * Pedidos de visita vindos do "Encontre uma célula" (PROD-23, o outro lado do
 * PROD-13).
 *
 * Só mostra — não há rota de escrita, e não deveria haver: o pedido é o que o
 * visitante digitou na página pública, e a liderança responde por telefone ou
 * e-mail, fora do produto. Quando a pessoa aparecer de fato, o registro é
 * `VisitRecord`, que é outra coisa (ver a nota do PROD-13 em `docs/PLANO.md`).
 *
 * O 403 é esperado, como no `PrayerRequestsPanel`, mas por outro motivo: ali a
 * API exige participação no grupo; aqui ela exige papel de liderança
 * (`ALERT_ROLES`), e a gaveta também abre para quem não o tem. Distinguir "sem
 * acesso" de "nenhum pedido" importa mais aqui do que na média das telas —
 * "nenhum interessado na sua célula" é uma leitura desanimadora e errada.
 */
export function VisitRequestsPanel({ groupId }: { groupId: string }) {
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");

  // "Carregando" é derivado de qual requisição já terminou, e não um setState
  // no corpo do effect — mesmo padrão do `PrayerRequestsPanel`, pelo que a
  // regra `react-hooks/set-state-in-effect` cobra.
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
        <HandHeart size={24} strokeWidth={1.5} className="text-stone" />
        <p className="text-sm text-stone">Nenhum pedido de visita recebido.</p>
        <p className="max-w-sm text-xs text-stone">
          Os pedidos chegam pela página pública &quot;Encontre uma célula&quot;, quando a célula
          está publicada.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--border-default)]">
      {requests.map((r) => (
        <li key={r.id} className="flex flex-col gap-1.5 px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-ink dark:text-white">{r.visitor_name}</span>
            <span className="shrink-0 text-xs text-stone">
              {formatInstant(r.created_at, {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {r.message && (
            <p className="whitespace-pre-wrap text-sm text-stone">{r.message}</p>
          )}

          {/* Contato como link, não como texto: responder é a única ação que
              existe aqui, e ela acontece fora do produto. A API garante que
              pelo menos um dos dois veio preenchido. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {r.visitor_phone && (
              <a
                href={`tel:${r.visitor_phone}`}
                className="flex items-center gap-1.5 text-xs text-navy hover:underline dark:text-white"
              >
                <Phone size={12} strokeWidth={1.5} />
                {r.visitor_phone}
              </a>
            )}
            {r.visitor_email && (
              <a
                href={`mailto:${r.visitor_email}`}
                className="flex items-center gap-1.5 text-xs text-navy hover:underline dark:text-white"
              >
                <Mail size={12} strokeWidth={1.5} />
                {r.visitor_email}
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
