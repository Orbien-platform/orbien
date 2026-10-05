import { saoPauloDateKey } from "@/lib/datetime";

/**
 * Períodos do financeiro: mês, trimestre, ano e intervalo livre.
 *
 * Tudo aqui é dia civil como "YYYY-MM-DD" (o formato do `<input type="date">`
 * e dos parâmetros da API), calculado com `Date.UTC` — nenhuma conta depende do
 * fuso de quem abriu a página. "Hoje" é o dia de Brasília, não o de UTC: às
 * 22h do último dia do mês, `toISOString()` já diria que é o mês seguinte.
 */

export type PeriodMode = "month" | "quarter" | "year" | "custom";

export interface Period {
  mode: PeriodMode;
  /** Primeiro dia, inclusive. */
  start: string;
  /** Último dia, inclusive. */
  end: string;
}

function parse(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthRange(year: number, monthIndex: number, months: number): { start: string; end: string } {
  return {
    start: format(new Date(Date.UTC(year, monthIndex, 1))),
    end: format(new Date(Date.UTC(year, monthIndex + months, 0))),
  };
}

/** Hoje, no dia civil de Brasília. */
export function todayKey(now: Date = new Date()): string {
  return saoPauloDateKey(now);
}

/** Do dia 1 ao último dia do mês do dia dado (padrão: hoje). */
export function monthRangeOf(key: string = todayKey()): { start: string; end: string } {
  const d = parse(key);
  return monthRange(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** O período do modo dado que contém o dia âncora (padrão: hoje). */
export function periodFor(mode: Exclude<PeriodMode, "custom">, anchor: string = todayKey()): Period {
  const d = parse(anchor);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (mode === "month") return { mode, ...monthRange(y, m, 1) };
  if (mode === "quarter") return { mode, ...monthRange(y, m - (m % 3), 3) };
  return { mode, ...monthRange(y, 0, 12) };
}

/**
 * Anda um período para trás (`-1`) ou para frente (`1`). Mês, trimestre e ano
 * pulam para o seguinte do mesmo tamanho; o intervalo livre desliza pela
 * própria duração.
 */
export function shiftPeriod(period: Period, direction: -1 | 1): Period {
  if (period.mode === "custom") {
    const start = parse(period.start);
    const end = parse(period.end);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    const move = days * direction * 86_400_000;
    return {
      mode: "custom",
      start: format(new Date(start.getTime() + move)),
      end: format(new Date(end.getTime() + move)),
    };
  }

  const d = parse(period.start);
  const step = period.mode === "month" ? 1 : period.mode === "quarter" ? 3 : 12;
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step * direction, 1));
  return periodFor(period.mode, format(next));
}

/**
 * Troca de modo mantendo, quando dá, o mês em que o usuário estava. Com a data
 * inicial apagada (intervalo livre pela metade) não há mês a manter: usa hoje.
 */
export function changeMode(period: Period, mode: PeriodMode): Period {
  if (mode === "custom") return { mode, start: period.start, end: period.end };
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(period.start) ? period.start : todayKey();
  return periodFor(mode, anchor);
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function monthName(monthIndex: number): string {
  return MONTH_NAMES[monthIndex] ?? "";
}

function dmy(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/** Texto do período para o navegador: "outubro de 2026", "3º trimestre de 2026"… */
export function periodLabel(period: Period): string {
  const d = parse(period.start);
  const y = d.getUTCFullYear();
  if (period.mode === "month") return `${monthName(d.getUTCMonth())} de ${y}`;
  if (period.mode === "quarter") return `${Math.floor(d.getUTCMonth() / 3) + 1}º trimestre de ${y}`;
  if (period.mode === "year") return String(y);
  return `${dmy(period.start)} a ${dmy(period.end)}`;
}

/** Um intervalo livre é utilizável: as duas datas existem e estão em ordem. */
export function isValidRange(start: string, end: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end) && start <= end;
}
