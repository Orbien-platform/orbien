/** Formatação e rótulos compartilhados pelo DRE e pelas visões por centro de custo. */

export function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
}

export type ResultKind = "profit" | "loss" | "zero";

/** Mesma regra do PDF na API (`resultLabel` em `dre-scope.ts`): o sinal decide. */
export function resultKind(net: number): ResultKind {
  if (net > 0) return "profit";
  if (net < 0) return "loss";
  return "zero";
}

export function resultLabel(net: number): string {
  const kind = resultKind(net);
  if (kind === "profit") return "Lucro do período";
  if (kind === "loss") return "Prejuízo do período";
  return "Resultado zerado";
}

export function resultToneClass(net: number): string {
  const kind = resultKind(net);
  if (kind === "profit") return "text-teal";
  if (kind === "loss") return "text-crimson";
  return "text-stone";
}

export const dateInputClass =
  "h-8 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-base)] px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 dark:text-white";
