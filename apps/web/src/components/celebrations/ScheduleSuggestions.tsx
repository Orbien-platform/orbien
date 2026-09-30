"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, Loader2, UserPlus } from "lucide-react";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatInstant } from "@/lib/datetime";

// Espelho de MinistrySuggestion/VolunteerSuggestion em
// apps/api/src/celebrations/celebration-schedule-suggestion.service.ts.
// A API não devolve um "motivo" textual: o critério do rodízio (menos vezes
// na função, depois quem serviu há mais tempo) aparece como dado — é ele que
// justifica a ordem da lista.
interface VolunteerSuggestion {
  volunteer_profile_id: string;
  person_id: string;
  full_name: string;
  times_served: number;
  last_served_at: string | null;
}

interface MinistrySuggestion {
  celebration_ministry_id: string;
  slots_remaining: number;
  eligible_count: number;
  suggestions: VolunteerSuggestion[];
}

export interface AppliedResult {
  overbooked?: boolean;
  unavailable_on_date?: boolean;
}

interface ScheduleSuggestionsProps {
  instanceId: string;
  /** CelebrationMinistry.id — é o que a rota de atribuição espera. */
  celebrationMinistryId: string;
  /** Chamado depois que uma sugestão virou atribuição. */
  onApplied: (result: AppliedResult) => void | Promise<void>;
}

function servedLabel(s: VolunteerSuggestion): string {
  if (s.times_served === 0 || !s.last_served_at) return "Nunca serviu nesta função";
  const times = `${s.times_served} ${s.times_served === 1 ? "vez" : "vezes"}`;
  const last = formatInstant(s.last_served_at, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `Serviu ${times} · última em ${last}`;
}

export function ScheduleSuggestions({
  instanceId,
  celebrationMinistryId,
  onApplied,
}: ScheduleSuggestionsProps) {
  const [data, setData] = useState<MinistrySuggestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // A rota devolve todas as funções da escala; aqui só interessa a desta.
  const fetchSuggestions = useCallback(
    (signal?: { cancelled: boolean }) =>
      api
        .get<MinistrySuggestion[]>(`/celebrations/instances/${instanceId}/schedule/suggest`)
        .then(({ data: rows }) => {
          if (signal?.cancelled) return;
          const row = Array.isArray(rows)
            ? rows.find((r) => r.celebration_ministry_id === celebrationMinistryId)
            : undefined;
          setData(row ?? null);
          setError(null);
        })
        .catch((err: unknown) => {
          if (signal?.cancelled) return;
          setError(apiErrorMessage(err, "Não foi possível carregar as sugestões."));
        })
        .finally(() => {
          if (!signal?.cancelled) setLoading(false);
        }),
    [instanceId, celebrationMinistryId]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    fetchSuggestions(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [fetchSuggestions]);

  async function apply(s: VolunteerSuggestion) {
    setApplyingId(s.volunteer_profile_id);
    setApplyError(null);
    try {
      const { data: result } = await api.post<AppliedResult>(
        `/celebrations/instances/${instanceId}/schedule/ministries/${celebrationMinistryId}/assignments`,
        { volunteer_profile_id: s.volunteer_profile_id }
      );
      await onApplied(result ?? {});
      await fetchSuggestions();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        // Alguém escalou essa pessoa entre a sugestão e o clique: a lista
        // estava velha. Recarrega para ela sumir e as próximas subirem.
        setApplyError(`${s.full_name} já está nesta função. A lista foi atualizada.`);
        await fetchSuggestions();
        await onApplied({});
      } else {
        setApplyError(apiErrorMessage(err, `Não foi possível escalar ${s.full_name}.`));
      }
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div
      className="mt-2 rounded-[8px] border border-[var(--border-default)] p-2"
      aria-busy={loading}
    >
      {applyError ? (
        <div className="mb-2 flex items-start gap-2 rounded-[6px] bg-crimson-dim p-2" role="alert">
          <AlertTriangle size={13} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
          <p className="text-xs text-crimson">{applyError}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-3">
          <Loader2 size={16} className="animate-spin text-stone" aria-label="Carregando sugestões" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-start gap-1.5 py-1">
          <p className="text-xs text-crimson">{error}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              fetchSuggestions();
            }}
            className="text-xs text-navy hover:underline"
          >
            Tentar de novo
          </button>
        </div>
      ) : !data || data.eligible_count === 0 ? (
        <p className="py-3 text-center text-xs text-stone">
          Ninguém disponível para esta função nesta data. Quem não informou
          disponibilidade para este dia e horário não é sugerido; use
          &ldquo;Adicionar voluntário&rdquo; para escalar manualmente.
        </p>
      ) : (
        <>
          <p className="px-1 pb-1.5 text-xs text-stone">
            {data.suggestions.length} de {data.eligible_count}{" "}
            {data.eligible_count === 1 ? "disponível" : "disponíveis"}, pelo rodízio
            {data.slots_remaining > 0
              ? ` · faltam ${data.slots_remaining} ${data.slots_remaining === 1 ? "vaga" : "vagas"}`
              : " · vagas preenchidas"}
          </p>
          <ol className="flex flex-col gap-1">
            {data.suggestions.map((s) => (
              <li key={s.volunteer_profile_id}>
                <button
                  type="button"
                  onClick={() => apply(s)}
                  disabled={applyingId !== null}
                  aria-label={`Escalar ${s.full_name}`}
                  className="flex w-full items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-left hover:bg-[var(--surface-subtle)] disabled:opacity-60"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-xs text-ink dark:text-white">{s.full_name}</span>
                    <span className="truncate text-[11px] text-stone">{servedLabel(s)}</span>
                  </span>
                  {applyingId === s.volunteer_profile_id ? (
                    <Loader2 size={12} className="flex-shrink-0 animate-spin text-navy" />
                  ) : (
                    <UserPlus size={12} strokeWidth={1.5} className="flex-shrink-0 text-navy" />
                  )}
                </button>
              </li>
            ))}
          </ol>
          {data.eligible_count > data.suggestions.length ? (
            <p className="px-1 pt-1.5 text-[11px] text-stone">
              Mostrando as {data.suggestions.length} primeiras. Para ver mais, use
              &ldquo;Adicionar voluntário&rdquo;.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
