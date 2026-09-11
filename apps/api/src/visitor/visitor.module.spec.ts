import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { VisitorModule } from './visitor.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { VisitorService } from './visitor.service';

describe('VisitorModule', () => {
  it('compila e registra o VisitorService', async () => {
    // VisitorPublicController usa `@UseGuards(ThrottlerGuard)` — o próprio guard
    // precisa do ThrottlerModule no grafo de DI para o módulo compilar.
    // PersonsModule agora importa ContentModule (retenção pós-contrato
    // notifica via NotificationsService), que traz PostsController —
    // precisa de JwtService no grafo, daí o JwtModule aqui também.
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        PrismaModule,
        StorageModule,
        VisitorModule,
      ],
    }).compile();

    expect(moduleRef.get(VisitorService)).toBeInstanceOf(VisitorService);

    await moduleRef.close();
  });
});
