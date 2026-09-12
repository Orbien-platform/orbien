import { BalanceteService } from './balancete.service';
import { PrismaService } from '../prisma/prisma.service';

function serviceWith(transactions: unknown[]) {
  const client = {
    financialTransaction: {
      findMany: jest.fn().mockResolvedValue(transactions),
    },
  };
  const prisma = { client } as unknown as PrismaService;
  return { service: new BalanceteService(prisma), client };
}

describe('BalanceteService', () => {
  it('agrupa transações por centro de custo, somando receita e despesa', async () => {
    const { service, client } = serviceWith([
      {
        amount: 100,
        category: { type: 'income' },
        costCenter: { id: 'cc1', name: 'Missões' },
      },
      {
        amount: 40,
        category: { type: 'expense' },
        costCenter: { id: 'cc1', name: 'Missões' },
      },
      {
        amount: 30,
        category: { type: 'income' },
        costCenter: { id: 'cc2', name: 'Templo' },
      },
    ]);

    const result = await service.build('tenant-1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });

    expect(client.financialTransaction.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: 'tenant-1',
        occurred_at: { gte: new Date('2026-01-01'), lte: expect.any(Date) },
      },
      include: {
        category: { select: { type: true } },
        costCenter: { select: { id: true, name: true } },
      },
    });

    expect(result.revenue_total).toBe(130);
    expect(result.expenses_total).toBe(40);
    expect(result.net_result).toBe(90);
    expect(result.lines).toHaveLength(2);

    const missoes = result.lines.find((l) => l.cost_center_id === 'cc1')!;
    expect(missoes.revenue_total).toBe(100);
    expect(missoes.expenses_total).toBe(40);
    expect(missoes.net_result).toBe(60);
    expect(missoes.count).toBe(2);
  });

  it('agrupa transações sem centro de custo sob "Sem centro de custo"', async () => {
    const { service } = serviceWith([
      { amount: 50, category: { type: 'income' }, costCenter: null },
    ]);

    const result = await service.build('tenant-1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });

    expect(result.lines).toEqual([
      {
        cost_center_id: null,
        cost_center_name: 'Sem centro de custo',
        revenue_total: 50,
        expenses_total: 0,
        net_result: 50,
        count: 1,
      },
    ]);
  });

  it('filtra por congregação quando informado', async () => {
    const { service, client } = serviceWith([]);

    await service.build('tenant-1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
      congregation_id: 'cong-1',
    });

    expect(client.financialTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ congregation_id: 'cong-1' }),
      }),
    );
  });

  it('lista vazia devolve totais zerados', async () => {
    const { service } = serviceWith([]);

    const result = await service.build('tenant-1', {
      period_start: '2026-01-01',
      period_end: '2026-01-31',
    });

    expect(result.lines).toEqual([]);
    expect(result.revenue_total).toBe(0);
    expect(result.expenses_total).toBe(0);
    expect(result.net_result).toBe(0);
  });
});
