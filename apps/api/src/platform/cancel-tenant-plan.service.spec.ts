import { NotFoundException } from '@nestjs/common';
import { CancelTenantPlanService } from './cancel-tenant-plan.service';
import { PrismaService } from '../prisma/prisma.service';

function serviceWith(tenantPlan: Record<string, unknown> | null) {
  const client = {
    tenantPlan: {
      findUnique: jest.fn().mockResolvedValue(tenantPlan),
      update: jest.fn().mockResolvedValue({ ...tenantPlan }),
    },
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new CancelTenantPlanService(prisma), client };
}

describe('CancelTenantPlanService', () => {
  describe('cancel', () => {
    it('marca status cancelled e grava cancelled_at quando o plano está ativo', async () => {
      const { service, client } = serviceWith({ tenant_id: 't1', status: 'active', cancelled_at: null });
      client.tenantPlan.update.mockResolvedValue({ tenant_id: 't1', status: 'cancelled', cancelled_at: new Date() });

      const result = await service.cancel('t1');

      expect(client.tenantPlan.update).toHaveBeenCalledWith({
        where: { tenant_id: 't1' },
        data: { status: 'cancelled', cancelled_at: expect.any(Date) },
      });
      expect(result.status).toBe('cancelled');
    });

    it('é idempotente: não reseta cancelled_at de quem já está cancelado', async () => {
      const cancelledAt = new Date('2026-01-01');
      const { service, client } = serviceWith({ tenant_id: 't1', status: 'cancelled', cancelled_at: cancelledAt });

      const result = await service.cancel('t1');

      expect(client.tenantPlan.update).not.toHaveBeenCalled();
      expect(result).toEqual({ tenant_id: 't1', status: 'cancelled', cancelled_at: cancelledAt });
    });

    it('lança NotFoundException quando o tenant não tem plano', async () => {
      const { service } = serviceWith(null);

      await expect(service.cancel('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivate', () => {
    it('marca status active e zera cancelled_at quando o plano estava cancelado', async () => {
      const { service, client } = serviceWith({ tenant_id: 't1', status: 'cancelled', cancelled_at: new Date() });
      client.tenantPlan.update.mockResolvedValue({ tenant_id: 't1', status: 'active', cancelled_at: null });

      const result = await service.reactivate('t1');

      expect(client.tenantPlan.update).toHaveBeenCalledWith({
        where: { tenant_id: 't1' },
        data: { status: 'active', cancelled_at: null },
      });
      expect(result).toEqual({ tenant_id: 't1', status: 'active', cancelled_at: null });
    });

    it('é no-op quando o plano não está cancelado', async () => {
      const { service, client } = serviceWith({ tenant_id: 't1', status: 'active', cancelled_at: null });

      const result = await service.reactivate('t1');

      expect(client.tenantPlan.update).not.toHaveBeenCalled();
      expect(result).toEqual({ tenant_id: 't1', status: 'active', cancelled_at: null });
    });

    it('lança NotFoundException quando o tenant não tem plano', async () => {
      const { service } = serviceWith(null);

      await expect(service.reactivate('inexistente')).rejects.toThrow(NotFoundException);
    });
  });
});
