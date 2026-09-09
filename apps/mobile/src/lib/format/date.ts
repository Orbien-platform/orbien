// Formatação de data em pt-BR, sem `Intl`.
//
// Por que não `Intl.DateTimeFormat("pt-BR")`: o Hermes só traz os dados de
// locale completos em build com `intl` habilitado, e o que sai quando não
// há dado é o formato en-US em silêncio — data errada na tela sem nenhum
// erro. Com o vocabulário fechado (12 meses, 7 dias), a tabela abaixo é
// determinística em qualquer aparelho e em teste.
//
// As datas da API chegam em ISO-8601 (`scheduled_date`, `occurred_at`).

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function parse(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "Setembro 2026" — cabeçalho de mês (tela de indisponibilidade). */
export function formatMonthYear(month: number, year: number): string {
  const name = MONTHS[month - 1];
  if (!name) return `${pad(month)}/${year}`;
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

/** `{ day: "13", month: "set" }` — bloco de data à esquerda do card. */
export function formatDayMonth(iso: string): { day: string; month: string } | null {
  const date = parse(iso);
  if (!date) return null;
  return { day: pad(date.getDate()), month: MONTHS_SHORT[date.getMonth()] ?? "" };
}

/** "sáb, 13 set · 19:00" — linha de apoio do card. Omite a hora quando a
 * data vem sem horário (meia-noite exata é o que a API grava para
 * data-only, então mostrar "00:00" seria inventar informação). */
export function formatDateTime(iso: string): string | null {
  const date = parse(iso);
  if (!date) return null;

  const weekday = WEEKDAYS_SHORT[date.getDay()] ?? "";
  const head = `${weekday}, ${date.getDate()} ${MONTHS_SHORT[date.getMonth()] ?? ""}`;
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;

  return hasTime ? `${head} · ${pad(date.getHours())}:${pad(date.getMinutes())}` : head;
}

/** "13 de setembro de 2026" — título de tela de detalhe. */
export function formatLongDate(iso: string): string | null {
  const date = parse(iso);
  if (!date) return null;
  return `${date.getDate()} de ${MONTHS[date.getMonth()] ?? ""} de ${date.getFullYear()}`;
}
