import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RecurringRuleController } from './recurring-rule.controller';
import { RecurringRuleService } from './recurring-rule.service';
import { RecurringRuleScheduler } from './recurring-rule.scheduler';

@Module({
  imports: [PrismaModule],
  controllers: [RecurringRuleController],
  providers: [RecurringRuleService, RecurringRuleScheduler],
  exports: [RecurringRuleService],
})
export class RecurringRuleModule {}
