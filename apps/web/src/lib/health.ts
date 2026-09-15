/**
 * Semáforo de saúde da célula (PROD-20, CEL20-04/06) — cor única,
 * compartilhada entre o indicador do `GroupDetailSheet` (`GroupHealthBadge`)
 * e a árvore genealógica (`GroupGenealogyTree`), para a cor nunca divergir
 * entre as duas telas (design.md).
 */
export type HealthStatus = "green" | "yellow" | "red";

export const HEALTH_DOT_COLOR: Record<HealthStatus, string> = {
  green: "bg-teal",
  yellow: "bg-amber-500",
  red: "bg-crimson",
};
