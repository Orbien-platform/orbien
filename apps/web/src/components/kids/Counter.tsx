"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Baby } from "lucide-react";
import { SessionDesk } from "@/components/kids/SessionDesk";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { Skeleton } from "@/components/ui/skeleton";
import { isForbidden } from "@/lib/api";
import { listInstancesOn, listSessions, type KidsSession } from "@/lib/kids";
import { todayKey } from "@/lib/period";
import { cn } from "@/lib/utils";

interface CounterEntry {
  session: KidsSession;
  celebrationName: string;
  startTime: string;
}

/**
 * Balcão do dia (KIDS-08/09): as turmas abertas nos cultos de hoje. Sem
 * sessão aberta hoje não é erro — é um dia sem kids, e a tela diz como abrir.
 */
export function Counter({ canManage }: { canManage: boolean }) {
  const [entries, setEntries] = useState<CounterEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const isLoading = loadedKey !== reloadKey;

  useEffect(() => {
    const signal = { cancelled: false };
    listInstancesOn(todayKey())
      .then(async (instances) => {
        const open = instances.filter((i) => i.status !== "cancelled");
        const lists = await Promise.all(open.map((i) => listSessions(i.id)));
        if (signal.cancelled) return;
        const all = open.flatMap((i, idx) =>
          lists[idx]
            .filter((s) => s.status === "open")
            .map((session) => ({ session, celebrationName: i.celebration.name, startTime: i.celebration.start_time })),
        );
        all.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.session.room.min_age_months - b.session.room.min_age_months);
        setEntries(all);
        setSelectedId((cur) => (cur && all.some((e) => e.session.id === cur) ? cur : (all[0]?.session.id ?? null)));
        setFailed(false);
        setDenied(false);
      })
      .catch((err) => {
        if (signal.cancelled) return;
        setEntries([]);
        setDenied(isForbidden(err));
        setFailed(!isForbidden(err));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(reloadKey);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [reloadKey]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Carregando o balcão">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (denied) return <NoAccessState resource="o balcão do Kids" />;
  if (failed) {
    return (
      <div role="alert" className="rounded-[12px] border border-[var(--border-default)] p-4 text-sm text-crimson">
        Não foi possível carregar as turmas de hoje.{" "}
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="underline">
          Tentar de novo
        </button>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[14px] border border-[var(--border-default)] bg-[var(--surface-base)] px-6 py-10 text-center">
        <Baby size={28} strokeWidth={1.2} className="text-stone" aria-hidden="true" />
        <p className="text-sm font-medium text-ink dark:text-white">Nenhuma turma kids aberta hoje</p>
        <p className="max-w-sm text-sm text-stone">
          Abra as turmas no detalhe do culto, em{" "}
          <Link href="/celebracoes" className="underline underline-offset-2">
            Celebrações
          </Link>
          . Cultos sem turma kids não aparecem aqui.
        </p>
      </div>
    );
  }

  const selected = entries.find((e) => e.session.id === selectedId) ?? entries[0];

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Turmas de hoje" className="flex flex-wrap gap-2">
        {entries.map(({ session, celebrationName, startTime }) => {
          const active = session.id === selected.session.id;
          return (
            <button
              key={session.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSelectedId(session.id)}
              className={cn(
                "flex flex-col items-start rounded-[12px] border px-3.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                active
                  ? "border-navy bg-navy-dim text-navy dark:text-white"
                  : "border-[var(--border-default)] text-stone hover:border-[var(--border-strong)] hover:text-ink dark:hover:text-white",
              )}
            >
              <span className="text-sm font-medium">{session.room.name}</span>
              <span className="text-xs">
                {celebrationName} · {startTime}
              </span>
              {session.volunteers_missing > 0 ? (
                <span className="mt-0.5 text-xs font-medium text-amber-ink">
                  {session.volunteers_missing === 1 ? "Falta 1 voluntário" : `Faltam ${session.volunteers_missing} voluntários`}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <SessionDesk key={selected.session.id} sessionId={selected.session.id} canOverride={canManage} />
    </div>
  );
}
