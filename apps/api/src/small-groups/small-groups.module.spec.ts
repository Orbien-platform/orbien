import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { SmallGroupsModule } from './small-groups.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SmallGroupsService } from './small-groups.service';
import { PublicSmallGroupsService } from './public-small-groups.service';
import { NetworksService } from './networks.service';
import { MeetingsService } from './meetings.service';
import { PrayerRequestsService } from './prayer-requests.service';
import { GroupMessagesService } from './group-messages.service';
import { SmallGroupsAbsenceNotifier } from './small-groups-absence.notifier';

describe('SmallGroupsModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      // `PublicSmallGroupsController` usa ThrottlerGuard (rota pública), e o
      // guard precisa do ThrottlerModule no grafo de DI para o módulo compilar.
      // JwtModule: o módulo passou a importar `ContentModule` (PROD-11), cujos
      // controllers pedem `JwtService` — mesma exigência de
      // `content.module.spec.ts` e `celebrations.module.spec.ts`.
      imports: [
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        PrismaModule,
        SmallGroupsModule,
      ],
    }).compile();

    expect(moduleRef.get(SmallGroupsService)).toBeInstanceOf(SmallGroupsService);
    expect(moduleRef.get(MeetingsService)).toBeInstanceOf(MeetingsService);
    expect(moduleRef.get(PrayerRequestsService)).toBeInstanceOf(PrayerRequestsService);
    expect(moduleRef.get(GroupMessagesService)).toBeInstanceOf(GroupMessagesService);
    expect(moduleRef.get(PublicSmallGroupsService)).toBeInstanceOf(PublicSmallGroupsService);
    expect(moduleRef.get(NetworksService)).toBeInstanceOf(NetworksService);
    expect(moduleRef.get(SmallGroupsAbsenceNotifier)).toBeInstanceOf(SmallGroupsAbsenceNotifier);

    await moduleRef.close();
  });
});
