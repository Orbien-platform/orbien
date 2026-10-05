"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  changeMode,
  isValidRange,
  periodLabel,
  shiftPeriod,
  type Period,
  type PeriodMode,
} from "@/lib/period";

const MODES: { value: PeriodMode; label: string }[] = [
  { value: "month", label: "Mês" },
  { value: "quarter", label: "Trimestre" },
  { value: "year", label: "Ano" },
  { value: "custom", label: "Personalizado" },
];

const dateInput =
  "h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white";

interface PeriodNavigatorProps {
  period: Period;
  onChange: (period: Period) => void;
}

/**
 * Escolhe o período que a Visão Geral mostra: mês, trimestre ou ano (com setas
 * para andar de um em um) ou um intervalo livre com data inicial e final.
 * Controlado — quem guarda o período é a tela, e quem busca o dado decide o que
 * fazer com um intervalo inválido (`isValidRange`).
 */
export function PeriodNavigator({ period, onChange }: PeriodNavigatorProps) {
  const custom = period.mode === "custom";
  const invalid = custom && !isValidRange(period.start, period.end);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div
        role="group"
        aria-label="Tipo de período"
        className="flex overflow-hidden rounded-[8px] border border-[var(--border-default)]"
      >
        {MODES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={period.mode === value}
            onClick={() => period.mode !== value && onChange(changeMode(period, value))}
            className={cn(
              "px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
              period.mode === value
                ? "bg-navy text-white"
                : "bg-[var(--surface-base)] text-stone hover:bg-[var(--surface-subtle)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {custom ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-stone">
            De
            <input
              type="date"
              value={period.start}
              max={period.end || undefined}
              onChange={(e) => onChange({ ...period, start: e.target.value })}
              aria-invalid={invalid || undefined}
              className={dateInput}
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-stone">
            até
            <input
              type="date"
              value={period.end}
              min={period.start || undefined}
              onChange={(e) => onChange({ ...period, end: e.target.value })}
              aria-invalid={invalid || undefined}
              className={dateInput}
            />
          </label>
          {invalid && (
            <p role="alert" className="text-sm text-crimson">
              Informe as duas datas, com a final igual ou posterior à inicial.
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-[8px]"
            aria-label="Período anterior"
            onClick={() => onChange(shiftPeriod(period, -1))}
          >
            <ChevronLeft size={14} />
          </Button>
          <span
            aria-live="polite"
            className="min-w-40 px-2 text-center text-sm font-medium text-ink first-letter:uppercase dark:text-white"
          >
            {periodLabel(period)}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-[8px]"
            aria-label="Próximo período"
            onClick={() => onChange(shiftPeriod(period, 1))}
          >
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
