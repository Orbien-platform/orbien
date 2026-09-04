import { RecurringRuleScheduler } from './recurring-rule.scheduler';
import { PrismaService } from '../../prisma/prisma.service';
import { RecurringRuleService } from './recurring-rule.service';

function serviceWith(dueRules: { id: string }[]) {
  const system = {
    recurringRule: { findMany: jest.fn().mockResolvedValue(dueRules) },
  };
  const prisma = { system } as unknown as PrismaService;
  const recurringRuleService = {
    generateNext: jest.fn(),
  } as unknown as jest.Mocked<RecurringRuleService>;

  return {
    scheduler: new RecurringRuleScheduler(prisma, recurringRuleService),
    prisma,
    recurringRuleService,
  };
}

describe('RecurringRuleScheduler.generateDueTransactions', () => {
  it('não faz nada quando não há regra vencida', async () => {
    const { scheduler, recurringRuleService } = serviceWith([]);

    await scheduler.generateDueTransactions();

    expect(recurringRuleService.generateNext).not.toHaveBeenCalled();
  });

  it('gera a transação de cada regra vencida', async () => {
    const { scheduler, recurringRuleService } = serviceWith([{ id: 'r1' }, { id: 'r2' }]);
    recurringRuleService.generateNext.mockResolvedValue({ id: 'r1' } as never);

    await scheduler.generateDueTransactions();

    expect(recurringRuleService.generateNext).toHaveBeenCalledWith('r1');
    expect(recurringRuleService.generateNext).toHaveBeenCalledWith('r2');
    expect(recurringRuleService.generateNext).toHaveBeenCalledTimes(2);
  });

  it('conta como não gerada quando generateNext devolve null (no-op)', async () => {
    const { scheduler, recurringRuleService } = serviceWith([{ id: 'r1' }]);
    recurringRuleService.generateNext.mockResolvedValue(null);

    await expect(scheduler.generateDueTransactions()).resolves.toBeUndefined();
  });

  it('uma regra que falha não impede as demais de rodar', async () => {
    const { scheduler, recurringRuleService } = serviceWith([{ id: 'r1' }, { id: 'r2' }]);
    recurringRuleService.generateNext
      .mockRejectedValueOnce(new Error('falhou'))
      .mockResolvedValueOnce({ id: 'r2' } as never);

    await expect(scheduler.generateDueTransactions()).resolves.toBeUndefined();
    expect(recurringRuleService.generateNext).toHaveBeenCalledTimes(2);
  });
});
