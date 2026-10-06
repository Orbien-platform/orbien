import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentModule } from '../content/content.module';
import { MinistriesController } from './ministries.controller';
import { MinistriesService } from './ministries.service';
import { VolunteerProfilesController } from './volunteer-profiles.controller';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { VolunteerMinistriesController } from './volunteer-ministries.controller';
import { VolunteerMinistriesService } from './volunteer-ministries.service';
import { UnavailabilityController } from './unavailability.controller';
import { UnavailabilityService } from './unavailability.service';
import { MyVolunteerProfileController } from './my-volunteer-profile.controller';

@Module({
  imports: [PrismaModule, ContentModule],
  controllers: [
    MinistriesController,
    VolunteerProfilesController,
    VolunteerMinistriesController,
    UnavailabilityController,
    MyVolunteerProfileController,
  ],
  providers: [
    MinistriesService,
    VolunteerProfilesService,
    VolunteerMinistriesService,
    UnavailabilityService,
  ],
  exports: [
    MinistriesService,
    VolunteerProfilesService,
    VolunteerMinistriesService,
    UnavailabilityService,
  ],
})
export class VolunteersModule {}
