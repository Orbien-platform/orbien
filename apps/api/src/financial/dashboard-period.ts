/**
 * Período do dashboard financeiro, em dias civis.
 *
 * Todo limite é meia-noite UTC e o fim é **exclusivo** (`occurred_at >= start
 * AND occurred_at < endExclusive`). É a mesma convenção do DRE e do balancete
 * (que fecham o dia com `setUTCHours(23, 59, 59, 999)`): o web grava
 * `occurred_at` ao meio-dia de Brasília (15:00Z) e importações gravam o dia
 * civil como 00:00Z — os dois caem no mesmo dia UTC, que é o dia mostrado.
 *
 * Antes o dashboard media "o mês" como `[dia 1, now)`. Isso deixava de fora o
 * lançamento de hoje criado antes do meio-dia (15:00Z ainda está no futuro às
 * 10h) e qualquer lançamento com data futura dentro do mês — a Visão Geral
 * ficava abaixo da lista de Lançamentos.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type Granularity = 'week' | 'month';

export interface DashboardPeriod {
  /** Primeiro dia, 00:00Z. */
  start: Date;
  /** Dia seguinte ao último, 00:00Z — limite exclusivo. */
  endExclusive: Date;
  /** Último dia incluído, 00:00Z (o que o usuário escolheu). */
  end: Date;
  granularity: Granularity;
}

export interface PeriodBucket {
  start: Date;
  /** Último dia do balde dentro do período, 00:00Z. */
  end: Date;
}

/** Acima disto o gráfico agrupa por mês; até aqui, por semana. */
const MAX_WEEKLY_DAYS = 93;

/** Teto do intervalo aceito — protege a consulta de um período absurdo. */
export const MAX_PERIOD_DAYS = 366 * 5;

function utcDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function parseDay(value: string): Date {
  const key = value.slice(0, 10);
  const [y, m, d] = key.split('-').map(Number);
  const day = utcDay(y, m - 1, d);
  // `Date.UTC` rola dia impossível para o mês seguinte (30/02 vira 02/03) e
  // `IsDateString` aceita a forma, não o calendário. Sem esta volta, o dashboard
  // responderia um intervalo diferente do pedido.
  if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== key) {
    throw new Error(`Data inválida: ${key}`);
  }
  return day;
}

/** "Hoje" no dia civil de Brasília (mesmo critério de `saoPauloDateKey` no web). */
export function todayInSaoPaulo(now: Date): Date {
  const key = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return parseDay(key);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

function startOfMonth(d: Date): Date {
  return utcDay(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return utcDay(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
}

function mondayOnOrBefore(d: Date): Date {
  const dow = d.getUTCDay(); // 0 = domingo
  return addDays(d, dow === 0 ? -6 : 1 - dow);
}

/**
 * Resolve o período pedido. Sem datas, é o mês corrente de Brasília.
 * Datas inválidas ou fora de ordem vêm como `Error` — o controller devolve 400.
 */
export function resolvePeriod(
  periodStart?: string,
  periodEnd?: string,
  now: Date = new Date(),
): DashboardPeriod {
  let start: Date;
  let end: Date;

  if (!periodStart && !periodEnd) {
    const today = todayInSaoPaulo(now);
    start = startOfMonth(today);
    end = addDays(addMonths(start, 1), -1);
  } else if (periodStart && periodEnd) {
    start = parseDay(periodStart);
    end = parseDay(periodEnd);
  } else {
    throw new Error('Informe period_start e period_end juntos');
  }

  if (end < start) throw new Error('period_end deve ser igual ou posterior a period_start');

  const days = daysBetween(start, end) + 1;
  if (days > MAX_PERIOD_DAYS) throw new Error('Período acima do limite de 5 anos');

  return {
    start,
    end,
    endExclusive: addDays(end, 1),
    granularity: days <= MAX_WEEKLY_DAYS ? 'week' : 'month',
  };
}

/**
 * O período imediatamente anterior, para a variação percentual. Meses cheios
 * (1º ao último dia de um ou mais meses) comparam com os mesmos meses antes —
 * outubro com setembro, e não com os 31 dias que o precedem. Qualquer outro
 * intervalo compara com os dias imediatamente anteriores, de mesmo tamanho.
 */
export function previousPeriod(period: DashboardPeriod): { start: Date; endExclusive: Date } {
  const { start, endExclusive } = period;
  const isMonthAligned =
    start.getUTCDate() === 1 && endExclusive.getUTCDate() === 1;

  if (isMonthAligned) {
    const months =
      (endExclusive.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      (endExclusive.getUTCMonth() - start.getUTCMonth());
    return { start: addMonths(start, -months), endExclusive: start };
  }

  const length = daysBetween(start, endExclusive);
  return { start: addDays(start, -length), endExclusive: start };
}

/**
 * Os baldes do gráfico: semanas (segunda a domingo, como o `date_trunc('week')`
 * do Postgres) ou meses. O primeiro e o último balde podem começar antes ou
 * terminar depois do período; a consulta só soma o que está dentro dele.
 */
export function buildBuckets(period: DashboardPeriod): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];

  if (period.granularity === 'week') {
    for (let s = mondayOnOrBefore(period.start); s <= period.end; s = addDays(s, 7)) {
      buckets.push({ start: s, end: addDays(s, 6) });
    }
  } else {
    for (let s = startOfMonth(period.start); s <= period.end; s = addMonths(s, 1)) {
      buckets.push({ start: s, end: addDays(addMonths(s, 1), -1) });
    }
  }

  return buckets;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
