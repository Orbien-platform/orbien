import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringFrequency, RecurringRuleMode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecurringRuleService } from './recurring-rule.service';

@Injectable()
export class RecurringRuleScheduler {
  private readonly logger = new Logger(RecurringRuleScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recurringRuleService: RecurringRuleService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDueTransactions(): Promise<void> {
    // system client: BYPASSRLS — cross-tenant scheduler
    const dueRules = await this.prisma.system.recurringRule.findMany({
      where: {
        is_active: true,
        mode: RecurringRuleMode.fixed,
        frequency: RecurringFrequency.monthly,
        next_occurrence_at: { lte: new Date() },
      },
      select: { id: true },
    });

    let generated = 0;
    let errors = 0;

    for (const { id } of dueRules) {
      try {
        const result = await this.recurringRuleService.generateNext(id);
        if (result) generated++;
      } catch (err) {
        errors++;
        this.logger.error(`Falha ao gerar próxima transação da regra ${id}: ${String(err)}`);
      }
    }

    this.logger.log(`Regras processadas=${dueRules.length} geradas=${generated} erros=${errors}`);
  }
}
