import { Injectable } from '@nestjs/common';
import { TenantPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChangeTenantPlanDto } from './dto/change-tenant-plan.dto';
import { findTenantPlanOrThrow } from './tenant-plan.util';

/**
 * Troca `TenantPlan.plan` (starter ↔ premium) de um tenant já provisionado.
 * Separado de `CancelTenantPlanService` porque muda um eixo diferente —
 * aquele mexe em `status`/`cancelled_at`, este no plano contratado — e os
 * dois podem evoluir por motivos diferentes (billing vs. suporte comercial).
 *
 * Idempotente: setar o plano que já está valendo não gera update nem evento
 * a mais.
 */
@Injectable()
export class ChangeTenantPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async change(tenantId: string, dto: ChangeTenantPlanDto): Promise<TenantPlan> {
    const plan = await findTenantPlanOrThrow(this.prisma, tenantId);
    if (plan.plan === dto.plan) return plan;

    return this.prisma.client.tenantPlan.update({
      where: { tenant_id: tenantId },
      data: { plan: dto.plan },
    });
  }
}
