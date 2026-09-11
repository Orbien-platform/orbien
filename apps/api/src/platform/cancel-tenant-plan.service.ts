import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanStatus, TenantPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Fluxo mínimo de cancelamento/reativação de tenant — o suficiente para
 * `TenantPlan.cancelled_at` deixar de ser um campo sem escritor. Sem UI de
 * billing por trás: existe só para os jobs de retenção da seção 5 do
 * mapeamento LGPD (dado financeiro em 5 anos, dado de menor em 30 dias)
 * terem um marco real de "fim do contrato".
 *
 * Idempotente nas duas direções — cancelar quem já está cancelado não
 * reseta `cancelled_at` (resetaria a janela de retenção em andamento);
 * reativar quem não está cancelado é no-op.
 */
@Injectable()
export class CancelTenantPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async cancel(tenantId: string): Promise<TenantPlan> {
    const plan = await this.findOrThrow(tenantId);
    if (plan.status === PlanStatus.cancelled) return plan;

    return this.prisma.client.tenantPlan.update({
      where: { tenant_id: tenantId },
      data: { status: PlanStatus.cancelled, cancelled_at: new Date() },
    });
  }

  async reactivate(tenantId: string): Promise<TenantPlan> {
    const plan = await this.findOrThrow(tenantId);
    if (plan.status !== PlanStatus.cancelled) return plan;

    return this.prisma.client.tenantPlan.update({
      where: { tenant_id: tenantId },
      data: { status: PlanStatus.active, cancelled_at: null },
    });
  }

  private async findOrThrow(tenantId: string): Promise<TenantPlan> {
    const plan = await this.prisma.client.tenantPlan.findUnique({ where: { tenant_id: tenantId } });
    if (!plan) throw new NotFoundException('Tenant sem plano — verifique o id');
    return plan;
  }
}
