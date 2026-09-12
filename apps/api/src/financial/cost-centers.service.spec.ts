import { ConflictException, NotFoundException } from '@nestjs/common';
import { CostCentersService } from './cost-centers.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

function serviceWith(overrides: Record<string, unknown> = {}) {
  const client = {
    costCenter: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    financialTransaction: {
      count: jest.fn(),
    },
    ...overrides,
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new CostCentersService(prisma), client };
}

describe('CostCentersService', () => {
  describe('create', () => {
    it('cria centro de custo escopado ao tenant e congregação do usuário', async () => {
      const { service, client } = serviceWith();
      client.costCenter.create.mockResolvedValue({ id: 'cc1' });

      const result = await service.create(
        { name: 'Missões', description: 'Fundo de missões' } as never,
        user,
      );

      expect(client.costCenter.create).toHaveBeenCalledWith({
        data: {
          name: 'Missões',
          description: 'Fundo de missões',
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
        },
      });
      expect(result).toEqual({ id: 'cc1' });
    });
  });

  describe('findAll', () => {
    it('lista escopada ao tenant e congregação, ordenada por nome', async () => {
      const { service, client } = serviceWith();
      client.costCenter.findMany.mockResolvedValue([{ id: 'cc1' }]);

      const result = await service.findAll(user);

      expect(client.costCenter.findMany).toHaveBeenCalledWith({
        where: { tenant_id: 'tenant-1', congregation_id: 'cong-1' },
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual([{ id: 'cc1' }]);
    });
  });

  describe('update', () => {
    it('rejeita quando o centro de custo não existe', async () => {
      const { service, client } = serviceWith();
      client.costCenter.findFirst.mockResolvedValue(null);

      await expect(service.update('cc1', {} as never, user)).rejects.toThrow(NotFoundException);
    });

    it('atualiza quando o centro de custo existe', async () => {
      const { service, client } = serviceWith();
      client.costCenter.findFirst.mockResolvedValue({ id: 'cc1' });
      client.costCenter.update.mockResolvedValue({ id: 'cc1', name: 'Novo nome' });

      const result = await service.update('cc1', { name: 'Novo nome' } as never, user);
      expect(result).toEqual({ id: 'cc1', name: 'Novo nome' });
    });
  });

  describe('remove', () => {
    it('rejeita quando o centro de custo não existe', async () => {
      const { service, client } = serviceWith();
      client.costCenter.findFirst.mockResolvedValue(null);

      await expect(service.remove('cc1', user)).rejects.toThrow(NotFoundException);
    });

    it('rejeita remover centro de custo com transação vinculada', async () => {
      const { service, client } = serviceWith();
      client.costCenter.findFirst.mockResolvedValue({ id: 'cc1' });
      client.financialTransaction.count.mockResolvedValue(2);

      await expect(service.remove('cc1', user)).rejects.toThrow(ConflictException);
    });

    it('remove centro de custo sem transação vinculada', async () => {
      const { service, client } = serviceWith();
      client.costCenter.findFirst.mockResolvedValue({ id: 'cc1' });
      client.financialTransaction.count.mockResolvedValue(0);
      client.costCenter.delete.mockResolvedValue({ id: 'cc1' });

      const result = await service.remove('cc1', user);
      expect(result).toEqual({ id: 'cc1' });
    });
  });
});
