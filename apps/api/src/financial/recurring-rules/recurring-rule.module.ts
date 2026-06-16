import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RecurringRuleController } from './recurring-rule.controller';
import { RecurringRuleService } from './recurring-rule.service';

@Module({
  imports: [PrismaModule],
  controllers: [RecurringRuleController],
  providers: [RecurringRuleService],
  exports: [RecurringRuleService],
})
export class RecurringRuleModule {}
