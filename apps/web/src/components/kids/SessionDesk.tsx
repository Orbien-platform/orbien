"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { AllergyNote } from "@/components/kids/AllergyNote";
import { CheckinDialog } from "@/components/kids/CheckinDialog";
import { CheckoutDialog } from "@/components/kids/CheckoutDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { NoAccessState } from "@/components/ui/NoAccessState";
import { SearchInput } from "@/components/ui/SearchInput";
import { isForbidden } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatInstant } from "@/lib/datetime";
import {
  ageInMonths,
  formatAge,
  getRoster,
  searchChildren,
  type KidsChild,
  type KidsRoster,
  type KidsRosterItem,
} from "@/lib/kids";

interface SessionDeskProps {
  sessionId: string;
  /** Líder kids pode autorizar saída por exceção. */
  canOverride: boolean;
}

/**
 * A mesa de uma turma no culto: quem está presente, check-in por busca e
 * entrega por código. O roster não traz o código — a equipe o vê só no
 * check-in e o responsável o diz na retirada.
 */
export function SessionDesk({ sessionId, canOverride }: SessionDeskProps) {
  const [roster, setRoster] = useState<KidsRoster | null>(null);
  const [rosterKey, setRosterKey] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [denied, setDenied] = useState(false);

  const [term, setTerm] = useState("");
  const [results, setResults] = useState<KidsChild[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [checkinChild, setCheckinChild] = useState<KidsChild | null>(null);
  const [checkoutItem, setCheckoutItem] = useState<KidsRosterItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const key = `${sessionId}|${rosterKey}`;
  const isLoading = loadedKey !== key;

  useEffect(() => {
    const signal = { cancelled: false };
    getRoster(sessionId)
      .then((r) => {
        if (signal.cancelled) return;
        setRoster(r);
        setFailed(false);
        setDenied(false);
      })
      .catch((err) => {
        if (signal.cancelled) return;
        setRoster(null);
        setDenied(isForbidden(err));
        setFailed(!isForbidden(err));
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(key);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [sessionId, key]);

  useEffect(() => {
    if (term.trim().length < 2) return;
    const signal = { cancelled: false };
    searchChildren(term)
      .then((r) => {
        if (signal.cancelled) return;
        setResults(r);
        setSearchError(null);
      })
      .catch((err) => {
        if (signal.cancelled) return;
        setResults([]);
        setSearchError(apiErrorMessage(err, "Não foi possível buscar crianças."));
      });
    return () => {
      signal.cancelled = true;
    };
  }, [term]);

  const reload = () => setRosterKey((k) => k + 1);
  const present = new Set(roster?.items.map((i) => i.child.id));
  const capacity = roster?.session.room.capacity ?? null;
  const full = capacity !== null && (roster?.present_count ?? 0) >= capacity;
  const searching = term.trim().length >= 2;

  if (denied) return <NoAccessState resource="esta turma" />;

  const columns: Column<KidsRosterItem>[] = [
    {
      key: "child",
      header: "Criança",
      render: (i) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-ink dark:text-white">{i.child.full_name}</span>
          <AllergyNote allergy={i.allergies} className="w-fit" />
        </div>
      ),
    },
    {
      key: "age",
      header: "Idade",
      width: "120px",
      render: (i) => (
        <span className="text-stone">{i.child.birth_date ? formatAge(ageInMonths(i.child.birth_date)) : "—"}</span>
      ),
    },
    {
      key: "guardian",
      header: "Entregue por",
      width: "180px",
      render: (i) => <span className="text-stone">{i.guardian.full_name}</span>,
    },
    {
      key: "since",
      header: "Entrada",
      width: "90px",
      render: (i) => (
        <span className="font-mono text-stone">
          {formatInstant(i.checked_in_at, { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      width: "170px",
      render: (i) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              setCheckoutItem(i);
            }}
            aria-label={`Entregar criança: ${i.child.full_name}`}
            className="rounded-full border border-[var(--border-strong)] px-3 py-1.5 text-sm font-medium text-ink outline-none transition-colors hover:border-teal hover:text-teal focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-white"
          >
            Entregar criança
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {notice ? (
        <p role="status" className="flex items-center gap-1.5 rounded-[8px] bg-teal-dim px-3 py-2 text-sm font-medium text-teal">
          <CheckCircle2 size={15} strokeWidth={1.8} aria-hidden="true" />
          {notice}
        </p>
      ) : null}

      <section aria-label="Check-in" className="flex flex-col gap-2">
        <SearchInput placeholder="Buscar criança pelo nome" onSearch={setTerm} className="w-full max-w-sm" />
        {searching && searchError ? (
          <p role="alert" className="text-sm text-crimson">
            {searchError}
          </p>
        ) : searching && results !== null ? (
          results.length === 0 ? (
            <p className="text-sm text-stone">Nenhuma criança com esse nome. Cadastre em Kids, Crianças.</p>
          ) : (
            <ul className="flex max-w-xl flex-col divide-y divide-[var(--border-default)] rounded-[12px] border border-[var(--border-default)]">
              {results.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-ink dark:text-white">{c.full_name}</span>
                    <span className="text-xs text-stone">
                      {c.birth_date ? formatAge(ageInMonths(c.birth_date)) : "Sem data de nascimento"}
                    </span>
                  </div>
                  {present.has(c.id) ? (
                    <span className="rounded-full bg-teal-dim px-2 py-0.5 text-xs font-medium text-teal">Presente</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNotice(null);
                        setCheckinChild(c);
                      }}
                      aria-label={`Fazer check-in: ${c.full_name}`}
                      className="rounded-full bg-navy px-3 py-1.5 text-sm font-medium text-white outline-none transition-colors hover:bg-navy/90 focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      Fazer check-in
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      <section aria-label="Presentes" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-ink dark:text-white">
            <Users size={15} strokeWidth={1.5} className="text-stone" aria-hidden="true" />
            Presentes ({roster?.present_count ?? 0})
          </h2>
          {capacity !== null && roster ? (
            <span
              className={
                full
                  ? "inline-flex items-center gap-1 rounded-full bg-amber-dim px-2 py-0.5 text-xs font-medium text-amber-ink"
                  : "rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium text-stone"
              }
            >
              {full ? <AlertTriangle size={12} strokeWidth={1.8} aria-hidden="true" /> : null}
              {roster.present_count} de {capacity}
              {full ? " · na capacidade" : ""}
            </span>
          ) : null}
        </div>
        <DataTable
          columns={columns}
          rows={roster?.items ?? []}
          getRowKey={(i) => i.checkin_id}
          isLoading={isLoading}
          skeletonRows={3}
          error={failed ? "Não foi possível carregar quem está presente." : undefined}
          onRetry={reload}
          emptyState={
            <div className="flex flex-col items-center gap-1 py-8 text-center">
              <p className="text-sm font-medium text-ink dark:text-white">Nenhuma criança presente</p>
              <p className="text-sm text-stone">Busque a criança acima para fazer o check-in.</p>
            </div>
          }
        />
      </section>

      {checkinChild && roster ? (
        <CheckinDialog
          sessionId={sessionId}
          roomName={roster.session.room.name}
          child={checkinChild}
          onClose={() => setCheckinChild(null)}
          onCheckedIn={reload}
        />
      ) : null}

      {checkoutItem ? (
        <CheckoutDialog
          item={checkoutItem}
          canOverride={canOverride}
          onClose={() => setCheckoutItem(null)}
          onDone={() => {
            setNotice(`Criança entregue: ${checkoutItem.child.full_name}.`);
            setCheckoutItem(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
