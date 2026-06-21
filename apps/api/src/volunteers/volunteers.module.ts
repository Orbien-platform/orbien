import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentModule } from '../content/content.module';
import { MinistriesController } from './ministries.controller';
import { MinistriesService } from './ministries.service';
import { VolunteerProfilesController } from './volunteer-profiles.controller';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { VolunteerMinistriesController } from './volunteer-ministries.controller';
import { VolunteerMinistriesService } from './volunteer-ministries.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { AssignmentsController } from './assignments.controller';
import { SwapRequestsController } from './swap-requests.controller';
import { SwapRequestsService } from './swap-requests.service';
import { CheckinController } from './checkin.controller';

@Module({
  imports: [PrismaModule, ContentModule],
  controllers: [
    MinistriesController,
    VolunteerProfilesController,
    VolunteerMinistriesController,
    SchedulesController,
    AssignmentsController,
    SwapRequestsController,
    CheckinController,
  ],
  providers: [
    MinistriesService,
    VolunteerProfilesService,
    VolunteerMinistriesService,
    SchedulesService,
    SwapRequestsService,
  ],
  exports: [
    MinistriesService,
    VolunteerProfilesService,
    VolunteerMinistriesService,
    SchedulesService,
    SwapRequestsService,
  ],
})
export class VolunteersModule {}
