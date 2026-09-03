import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { VisitorModule } from './visitor.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { VisitorService } from './visitor.service';

describe('VisitorModule', () => {
  it('compila e registra o VisitorService', async () => {
    // VisitorPublicController usa `@UseGuards(ThrottlerGuard)` — o próprio guard
    // precisa do ThrottlerModule no grafo de DI para o módulo compilar.
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]), PrismaModule, StorageModule, VisitorModule],
    }).compile();

    expect(moduleRef.get(VisitorService)).toBeInstanceOf(VisitorService);

    await moduleRef.close();
  });
});
