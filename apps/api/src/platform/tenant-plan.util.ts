import { NotFoundException } from '@nestjs/common';
import { TenantPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Compartilhado por `CancelTenantPlanService` e `ChangeTenantPlanService` —
 * os dois mexem em `TenantPlan` a partir do id do tenant, e os dois precisam
 * do mesmo 404 quando o tenant não tem plano.
 */
export async function findTenantPlanOrThrow(
  prisma: PrismaService,
  tenantId: string,
): Promise<TenantPlan> {
  const plan = await prisma.client.tenantPlan.findUnique({ where: { tenant_id: tenantId } });
  if (!plan) throw new NotFoundException('Tenant sem plano — verifique o id');
  return plan;
}
