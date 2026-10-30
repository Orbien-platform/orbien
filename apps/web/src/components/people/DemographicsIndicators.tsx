"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Demographics {
  by_gender: {
    male: number;
    female: number;
    other: number;
    prefer_not_to_say: number;
    not_informed: number;
  };
  by_age_range: Array<{ range: string; total: number }>;
}

interface Bar {
  key: string;
  label: string;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const nf = new Intl.NumberFormat("pt-BR");
const pf = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const GENDER_LABELS: Array<[keyof Demographics["by_gender"], string]> = [
  ["female", "Feminino"],
  ["male", "Masculino"],
  ["other", "Outro"],
  ["prefer_not_to_say", "Prefere não informar"],
  ["not_informed", "Não informado"],
];

function isDemographics(data: unknown): data is Demographics {
  const d = data as Partial<Demographics> | null;
  return !!d && typeof d.by_gender === "object" && Array.isArray(d.by_age_range);
}

function ageLabel(range: string): string {
  return range === "60+" ? "60 anos ou mais" : `${range.replace("-", " a ")} anos`;
}

function BarList({ bars, label }: { bars: Bar[]; label: string }) {
  const sum = bars.reduce((acc, b) => acc + b.total, 0);
  const max = Math.max(...bars.map((b) => b.total), 1);
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {bars.map((b) => (
        <li key={b.key} className="grid grid-cols-[minmax(7rem,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="text-stone">{b.label}</span>
          <span
            role="presentation"
            className="h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
          >
            <span
              className="block h-full rounded-full bg-navy"
              style={{ width: `${(b.total / max) * 100}%` }}
            />
          </span>
          <span className="w-24 text-right font-mono text-ink dark:text-white">
            {nf.format(b.total)}
            <span className="ml-1.5 text-xs text-stone">
              {sum > 0 ? `${pf.format((b.total / sum) * 100)}%` : "0%"}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Panel({
  title,
  note,
  isLoading,
  children,
}: {
  title: string;
  note: string;
  isLoading: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-5"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-ink dark:text-white">{title}</h3>
        <p className="text-xs text-stone">{note}</p>
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Perfil da congregação: pessoas por sexo e membros por faixa etária, lidos de
 * `GET /persons/demographics`. Cada recorte busca o seu e falha sozinho — a
 * rota é de outros papéis que a de presença, então um 403 aqui não derruba a página.
 */
export function DemographicsIndicators() {
  const [byGender, setByGender] = useState<Demographics | null>(null);
  const [members, setMembers] = useState<Demographics | null>(null);
  const [genderDone, setGenderDone] = useState(false);
  const [membersDone, setMembersDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = (
      params: { classification: string } | undefined,
      set: (d: Demographics | null) => void,
      done: () => void,
    ) => {
      api
        .get<Demographics>("/persons/demographics", params ? { params } : undefined)
        .then(({ data }) => (isDemographics(data) ? data : null))
        .catch(() => null)
        .then((data) => {
          if (cancelled) return;
          set(data);
          done();
        });
    };
    load(undefined, setByGender, () => setGenderDone(true));
    load({ classification: "member" }, setMembers, () => setMembersDone(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if ((genderDone && !byGender) && (membersDone && !members)) return null;

  const genderBars: Bar[] = byGender
    ? GENDER_LABELS.filter(
        ([k]) => k === "female" || k === "male" || byGender.by_gender[k] > 0,
      ).map(([k, label]) => ({ key: k, label, total: byGender.by_gender[k] }))
    : [];

  const ageBars: Bar[] = members
    ? members.by_age_range
        .filter((r) => r.range !== "not_informed")
        .map((r) => ({ key: r.range, label: ageLabel(r.range), total: r.total }))
    : [];
  const ageMissing = members?.by_age_range.find((r) => r.range === "not_informed")?.total ?? 0;
  const ageKnown = ageBars.reduce((acc, b) => acc + b.total, 0);

  return (
    <section aria-label="Perfil das pessoas" className="flex flex-col gap-3">
      <SectionHeader title="Perfil das pessoas" />
      <div className="grid gap-3 lg:grid-cols-2">
        {genderDone && !byGender ? null : (
          <Panel
            title="Pessoas por sexo"
            note="Todas as pessoas cadastradas na congregação."
            isLoading={!genderDone}
          >
            <BarList bars={genderBars} label="Pessoas por sexo" />
          </Panel>
        )}
        {membersDone && !members ? null : (
          <Panel
            title="Membros por faixa etária"
            note={
              ageMissing > 0
                ? `${nf.format(ageMissing)} ${ageMissing === 1 ? "membro sem data" : "membros sem data"} de nascimento ${ageMissing === 1 ? "fica" : "ficam"} de fora.`
                : "Idade calculada pela data de nascimento."
            }
            isLoading={!membersDone}
          >
            {ageKnown === 0 ? (
              <p className="text-sm text-stone">Nenhum membro com data de nascimento cadastrada.</p>
            ) : (
              <BarList bars={ageBars} label="Membros por faixa etária" />
            )}
          </Panel>
        )}
      </div>
    </section>
  );
}
