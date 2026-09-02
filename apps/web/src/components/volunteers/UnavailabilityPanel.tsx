"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { AlertTriangle, Check, CalendarOff, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Unavailability {
  id: string;
  reference_month: number;
  reference_year: number;
  notes: string | null;
  dates: { date: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function errMsg(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === "string") {
    return err.response.data.message;
  }
  return fallback;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Chave YYYY-MM-DD, que é o formato aceito pela API. */
function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Dia da semana (0=domingo) do dia 1 do mês. */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/** Próximos 12 meses a partir do atual, para o seletor. */
function monthOptions(): { month: number; year: number; label: string }[] {
  const now = new Date();
  const out: { month: number; year: number; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    out.push({ month, year, label: `${MONTHS[month - 1]} ${year}` });
  }
  return out;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function UnavailabilityPanel() {
  // Estável entre renders: recalcular a cada render invalidaria as
  // dependências do effect abaixo a todo momento.
  const options = useMemo(() => monthOptions(), []);
  const [selected, setSelected] = useState(0);
  const current = options[selected] ?? options[0]!;
  const { month, year } = current;

  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  // Carregamento derivado: qual mês já terminou de carregar. Evita setState
  // síncrono dentro do effect.
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const monthKey = `${year}-${month}`;
  const isLoading = loadedKey !== monthKey;

  useEffect(() => {
    // Cancelamento evita que a resposta de um mês antigo sobrescreva o atual.
    const signal = { cancelled: false };
    api
      .get<Unavailability | null>(`/volunteers/unavailability?month=${month}&year=${year}`)
      .then(({ data }) => {
        if (signal.cancelled) return;
        // Sem registro para o mês é resposta legítima (null), não erro.
        setSelectedDays(new Set((data?.dates ?? []).map((d) => d.date.slice(0, 10))));
        setNotes(data?.notes ?? "");
        setError(null);
        setSaved(false);
      })
      .catch((err: unknown) => {
        if (signal.cancelled) return;
        setError(errMsg(err, "Não foi possível carregar suas indisponibilidades."));
        setSelectedDays(new Set());
        setNotes("");
      })
      .finally(() => {
        if (!signal.cancelled) setLoadedKey(`${year}-${month}`);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [month, year]);

  function toggleDay(day: number) {
    const key = dayKey(year, month, day);
    setSaved(false);
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    setSaved(false);
    try {
      // A API substitui o conjunto inteiro do mês, então enviamos tudo.
      await api.post("/volunteers/unavailability", {
        referenceMonth: month,
        referenceYear: year,
        dates: Array.from(selectedDays).sort(),
        notes: notes.trim() || undefined,
      });
      setSaved(true);
    } catch (err) {
      setError(errMsg(err, "Não foi possível salvar suas indisponibilidades."));
    } finally {
      setIsSaving(false);
    }
  }

  const total = daysInMonth(year, month);
  const offset = firstWeekday(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-stone">
        Marque os dias em que você <span className="font-medium">não</span> pode servir. Quem
        monta a escala vê esse aviso ao escolher voluntários.
      </p>

      {/* Mês de referência */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="unav-month" className="text-xs">
          Mês de referência
        </Label>
        <select
          id="unav-month"
          value={selected}
          onChange={(e) => setSelected(Number(e.target.value))}
          disabled={isLoading || isSaving}
          className="h-9 w-56 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white"
        >
          {options.map((o, i) => (
            <option key={`${o.year}-${o.month}`} value={i}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-[8px] bg-crimson-dim p-3">
          <AlertTriangle size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-crimson" />
          <p className="text-sm text-crimson">{error}</p>
        </div>
      ) : null}

      {saved ? (
        <div className="flex items-start gap-2 rounded-[8px] bg-teal-dim p-3">
          <Check size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-teal" />
          <p className="text-sm text-teal">Indisponibilidades salvas.</p>
        </div>
      ) : null}

      {isLoading ? (
        <Skeleton className="h-64 w-full max-w-sm rounded-[12px]" />
      ) : (
        <>
          {/* Calendário do mês */}
          <div className="w-full max-w-sm rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-4">
            <div className="mb-2 grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="text-center text-[11px] font-medium text-stone">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) =>
                day === null ? (
                  <span key={`empty-${i}`} />
                ) : (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    disabled={isSaving}
                    aria-pressed={selectedDays.has(dayKey(year, month, day))}
                    aria-label={`${day} de ${MONTHS[month - 1]}`}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-[6px] text-sm transition-colors",
                      selectedDays.has(dayKey(year, month, day))
                        ? "bg-crimson text-white"
                        : "text-ink hover:bg-[var(--surface-subtle)] dark:text-white"
                    )}
                  >
                    {day}
                  </button>
                )
              )}
            </div>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-stone">
            <CalendarOff size={12} strokeWidth={1.5} />
            {selectedDays.size === 0
              ? "Nenhum dia marcado — você está disponível todo o mês."
              : `${selectedDays.size} dia${selectedDays.size > 1 ? "s" : ""} marcado${selectedDays.size > 1 ? "s" : ""}.`}
          </p>

          {/* Observação */}
          <div className="flex max-w-sm flex-col gap-1.5">
            <Label htmlFor="unav-notes" className="text-xs">
              Observação (opcional)
            </Label>
            <Input
              id="unav-notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setSaved(false);
              }}
              disabled={isSaving}
              placeholder="Ex.: viagem de família"
            />
          </div>

          <Button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="flex w-fit items-center gap-1.5 rounded-[8px] bg-navy px-3 py-2 text-sm text-white hover:bg-navy/90 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} strokeWidth={1.5} />
            )}
            Salvar
          </Button>
        </>
      )}
    </div>
  );
}
