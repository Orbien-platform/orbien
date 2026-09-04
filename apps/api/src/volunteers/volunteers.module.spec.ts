import { Test } from '@nestjs/testing';
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
      imports: [PrismaModule, ContentModule, StorageModule, VolunteersModule],
    }).compile();

    expect(moduleRef.get(MinistriesService)).toBeInstanceOf(MinistriesService);
    expect(moduleRef.get(VolunteerProfilesService)).toBeInstanceOf(VolunteerProfilesService);
    expect(moduleRef.get(VolunteerMinistriesService)).toBeInstanceOf(VolunteerMinistriesService);
    expect(moduleRef.get(UnavailabilityService)).toBeInstanceOf(UnavailabilityService);

    await moduleRef.close();
  });
});
