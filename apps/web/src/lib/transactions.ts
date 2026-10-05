import api from "@/lib/api";

/** A API entrega no máximo 100 por página (`ListTransactionsQueryDto`). */
export const TX_FETCH_LIMIT = 100;
/** Teto de páginas por consulta — protege a tela de um período gigante. */
export const TX_MAX_PAGES = 50;

interface TransactionsPage<T> {
  data?: T[];
  total?: number;
}

/**
 * Todos os lançamentos entre dois instantes, página a página.
 *
 * Existe porque quem soma (apuração da aba Lançamentos, cartões da home)
 * precisa do conjunto inteiro: pegar só `?limit=100` somava as 100 linhas mais
 * recentes — e como a ordem é por data, um lançamento com data futura ou um
 * mês movimentado empurrava semanas inteiras para fora da conta.
 *
 * `truncated` avisa que o teto de páginas cortou o resultado; quem mostra
 * total deve dizer isso.
 */
export async function fetchTransactionsInRange<T>(
  since?: string,
  until?: string
): Promise<{ rows: T[]; truncated: boolean }> {
  const params = new URLSearchParams({ limit: String(TX_FETCH_LIMIT) });
  if (since) params.set("since", since);
  if (until) params.set("until", until);

  const rows: T[] = [];
  let total = 0;
  for (let page = 1; page <= TX_MAX_PAGES; page++) {
    params.set("page", String(page));
    const res = await api.get<TransactionsPage<T>>(`/financial/transactions?${params.toString()}`);
    const chunk = res.data?.data ?? [];
    rows.push(...chunk);
    total = res.data?.total ?? rows.length;
    if (chunk.length === 0 || rows.length >= total) break;
  }
  return { rows, truncated: rows.length < total };
}

/** Limites de um intervalo de dias civis ("YYYY-MM-DD"), em dia UTC — a convenção do DRE. */
export function dayRangeBounds(from: string, to: string): { since?: string; until?: string } {
  return {
    since: from ? `${from}T00:00:00.000Z` : undefined,
    until: to ? `${to}T23:59:59.999Z` : undefined,
  };
}
