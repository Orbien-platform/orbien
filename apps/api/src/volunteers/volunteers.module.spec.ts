import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { VolunteersModule } from './volunteers.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentModule } from '../content/content.module';
import { StorageModule } from '../storage/storage.module';
import { MinistriesService } from './ministries.service';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { VolunteerMinistriesService } from './volunteer-ministries.service';
import { UnavailabilityService } from './unavailability.service';

describe('VolunteersModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        // `ContentModule` passou a depender do `JwtService`: o `PostsController`
        // assina o ticket de upload. No app o `JwtModule` é global, montado no
        // `AppModule`; aqui o módulo é carregado sozinho, então a montagem tem
        // que vir junto — é o mesmo que `auth.module.spec.ts` já faz.
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        PrismaModule,
        ContentModule,
        StorageModule,
        VolunteersModule,
      ],
    }).compile();

    expect(moduleRef.get(MinistriesService)).toBeInstanceOf(MinistriesService);
    expect(moduleRef.get(VolunteerProfilesService)).toBeInstanceOf(VolunteerProfilesService);
    expect(moduleRef.get(VolunteerMinistriesService)).toBeInstanceOf(VolunteerMinistriesService);
    expect(moduleRef.get(UnavailabilityService)).toBeInstanceOf(UnavailabilityService);

    await moduleRef.close();
  });
});
