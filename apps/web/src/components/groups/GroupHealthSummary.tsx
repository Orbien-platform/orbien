"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { HEALTH_DOT_COLOR, type HealthStatus } from "@/lib/health";

interface HealthSummaryResponse extends Record<HealthStatus, number> {
  total: number;
}

const COLUMNS: { status: HealthStatus; label: string }[] = [
  { status: "green", label: "Saudáveis" },
  { status: "yellow", label: "Atenção" },
  { status: "red", label: "Críticos" },
];

// Semáforo da igreja no Início (PROD-30): quantas células estão em cada cor,
// a mesma de `GroupHealthBadge` e da árvore. A rota é Premium e da gestão —
// em 403 (Starter ou outro papel) ou qualquer falha o bloco some, como no
// `GroupHealthBadge`: é um bloco do Início, não uma tela que se nega.
export function GroupHealthSummary() {
  const [summary, setSummary] = useState<HealthSummaryResponse | null>(null);

  useEffect(() => {
    const signal = { cancelled: false };
    api
      .get<HealthSummaryResponse>("/small-groups/health-summary")
      .then(({ data }) => {
        if (!signal.cancelled) setSummary(data);
      })
      .catch(() => {
        if (!signal.cancelled) setSummary(null);
      });
    return () => {
      signal.cancelled = true;
    };
  }, []);

  if (!summary || summary.total === 0) return null;

  return (
    <div data-testid="group-health-summary">
      <SectionHeader title="Semáforo" action={{ href: "/grupos", label: "Ver lista" }} />
      <div className="mt-3 grid grid-cols-3 gap-4 rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-5 shadow-[var(--shadow-sm)]">
        {COLUMNS.map(({ status, label }) => (
          <div key={status} data-testid={`group-health-${status}`}>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT_COLOR[status]}`} aria-hidden />
              <span className="text-2xl font-medium text-ink">{summary[status]}</span>
            </div>
            <p className="mt-1 text-sm text-stone">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
