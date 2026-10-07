import { Prisma } from '@prisma/client';

/**
 * Única definição de "o que entra no resultado" (AD-011): lucro/prejuízo é
 * resultado REALIZADO. `pending` fica fora e vira a linha informativa
 * "A realizar". DRE, matriz por centro, Balancete e série mensal usam este
 * mesmo recorte — é o que faz as três visões fecharem entre si.
 */
export const REALIZED_STATUSES = ['paid', 'confirmed'] as const;

export type ScopeStatus = 'pending' | 'paid' | 'confirmed';

export interface ScopeParams {
  tenantId: string;
  start: Date;
  end: Date;
  statuses: readonly ScopeStatus[];
  congregationId?: string;
  /** UUID do centro, ou o literal `none` (lançamentos sem centro). Vence `costCenterName`. */
  costCenterId?: string;
  /** Filtro por nome, mantido só por compatibilidade com `cost_center`. */
  costCenterName?: string;
}

export function buildScope(p: ScopeParams): Prisma.FinancialTransactionWhereInput {
  const where: Prisma.FinancialTransactionWhereInput = {
    tenant_id: p.tenantId,
    occurred_at: { gte: p.start, lte: p.end },
    status: { in: [...p.statuses] },
  };

  if (p.congregationId) where.congregation_id = p.congregationId;

  if (p.costCenterId) {
    where.cost_center_id = p.costCenterId === 'none' ? null : p.costCenterId;
  } else if (p.costCenterName) {
    where.costCenter = { name: p.costCenterName };
  }

  return where;
}

/** Arredonda a 2 casas, sem deixar resíduo de ponto flutuante nem `-0`. */
export function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

export function resultLabel(net: number): 'Lucro' | 'Prejuízo' | 'Resultado zerado' {
  if (net > 0) return 'Lucro';
  if (net < 0) return 'Prejuízo';
  return 'Resultado zerado';
}
