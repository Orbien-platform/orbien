"use client";

import { useEffect, useState } from "react";
import { Baby } from "lucide-react";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { getAttendanceSummary, type KidsAttendanceSummary } from "@/lib/kids";
import { isForbidden } from "@/lib/api";

const nf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/**
 * Presença kids por turma no período (KIDS-12): média de crianças por sessão,
 * só entre as sessões que tiveram check-in. Sem nenhuma, é estado vazio — um
 * zero diria “ninguém veio”, e o que se sabe é “ninguém fez check-in”.
 * Quem não lê o indicador (403) não vê o cartão, sem aviso.
 */
export function KidsAttendanceCard({ start, end }: { start: string; end: string }) {
  const [summary, setSummary] = useState<KidsAttendanceSummary | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const key = `${start}|${end}|${reloadKey}`;
  const isLoading = loadedKey !== key;

  useEffect(() => {
    const signal = { cancelled: false };
    getAttendanceSummary({ date_from: start, date_to: end })
      .then((s) => {
        if (signal.cancelled) return;
        setSummary(s);
        setFailed(false);
        setHidden(false);
      })
      .catch((err) => {
        if (signal.cancelled) return;
        setSummary(null);
        setHidden(isForbidden(err));
        setFailed(!isForbidden(err));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(key);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [start, end, key]);

  if (hidden) return null;

  return (
    <section aria-label="Kids por turma" className="flex flex-col gap-3">
      <SectionHeader title="Kids por turma" />
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : failed ? (
        <div role="alert" className="rounded-[12px] border border-[var(--border-default)] p-4 text-sm text-crimson">
          Não foi possível carregar a presença do Kids.{" "}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline">
            Tentar de novo
          </button>
        </div>
      ) : !summary || summary.sessions_counted === 0 ? (
        <div className="flex items-start gap-3 rounded-[14px] border border-[var(--border-default)] bg-[var(--surface-base)] px-5 py-6">
          <Baby size={20} strokeWidth={1.5} className="mt-0.5 text-stone" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-ink dark:text-white">Sem check-in neste período</p>
            <p className="mt-1 text-sm text-stone">
              A média aparece quando as crianças fazem check-in nas turmas dos cultos. Sessões sem check-in não entram na
              conta.
            </p>
          </div>
        </div>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-[var(--border-default)] rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)]">
            {summary.rooms.map((r) => (
              <li key={r.room_id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                <span className="text-sm font-medium text-ink dark:text-white">{r.room_name}</span>
                <span className="flex items-baseline gap-3 text-sm">
                  <span className="font-mono text-lg font-medium text-ink dark:text-white">{nf.format(r.average_children)}</span>
                  <span className="text-stone">
                    por sessão · {r.sessions_counted} {r.sessions_counted === 1 ? "sessão" : "sessões"} com check-in
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone">Média de crianças distintas por sessão. Sessões sem check-in não entram.</p>
        </>
      )}
    </section>
  );
}
