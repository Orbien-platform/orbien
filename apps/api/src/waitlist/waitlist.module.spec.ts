import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { WaitlistModule } from './waitlist.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WaitlistService } from './waitlist.service';

describe('WaitlistModule', () => {
  it('compila e registra o WaitlistService', async () => {
    // WaitlistPublicController usa `@UseGuards(ThrottlerGuard)` — o próprio
    // guard precisa do ThrottlerModule no grafo de DI para o módulo compilar.
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]), PrismaModule, WaitlistModule],
    }).compile();

    expect(moduleRef.get(WaitlistService)).toBeInstanceOf(WaitlistService);

    await moduleRef.close();
  });
});
