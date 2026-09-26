import { NotFoundException } from '@nestjs/common';
import { ChangeTenantPlanService } from './change-tenant-plan.service';
import { PrismaService } from '../prisma/prisma.service';

function serviceWith(tenantPlan: Record<string, unknown> | null) {
  const client = {
    tenantPlan: {
      findUnique: jest.fn().mockResolvedValue(tenantPlan),
      update: jest.fn().mockResolvedValue({ ...tenantPlan }),
    },
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new ChangeTenantPlanService(prisma), client };
}

describe('ChangeTenantPlanService', () => {
  it('atualiza o plano quando ele muda', async () => {
    const { service, client } = serviceWith({ tenant_id: 't1', plan: 'starter' });
    client.tenantPlan.update.mockResolvedValue({ tenant_id: 't1', plan: 'premium' });

    const result = await service.change('t1', { plan: 'premium' } as never);

    expect(client.tenantPlan.update).toHaveBeenCalledWith({
      where: { tenant_id: 't1' },
      data: { plan: 'premium' },
    });
    expect(result.plan).toBe('premium');
  });

  it('é idempotente: não escreve quando o plano pedido já é o atual', async () => {
    const { service, client } = serviceWith({ tenant_id: 't1', plan: 'premium' });

    const result = await service.change('t1', { plan: 'premium' } as never);

    expect(client.tenantPlan.update).not.toHaveBeenCalled();
    expect(result).toEqual({ tenant_id: 't1', plan: 'premium' });
  });

  it('lança NotFoundException quando o tenant não tem plano', async () => {
    const { service } = serviceWith(null);

    await expect(service.change('inexistente', { plan: 'premium' } as never)).rejects.toThrow(
      NotFoundException,
    );
  });
});
