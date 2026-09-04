process.env['DATABASE_URL'] ??= 'postgresql://user:pass@localhost:5432/db';
process.env['DIRECT_URL'] ??= process.env['DATABASE_URL'];

import { Test } from '@nestjs/testing';
import { RecurringRuleModule } from './recurring-rule.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RecurringRuleController } from './recurring-rule.controller';
import { RecurringRuleService } from './recurring-rule.service';
import { RecurringRuleScheduler } from './recurring-rule.scheduler';

describe('RecurringRuleModule', () => {
  it('compila e registra controller, service e scheduler', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, RecurringRuleModule],
    }).compile();

    expect(moduleRef.get(RecurringRuleController)).toBeInstanceOf(RecurringRuleController);
    expect(moduleRef.get(RecurringRuleService)).toBeInstanceOf(RecurringRuleService);
    expect(moduleRef.get(RecurringRuleScheduler)).toBeInstanceOf(RecurringRuleScheduler);

    await moduleRef.close();
  });
});
