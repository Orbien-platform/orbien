import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentModule } from '../content/content.module';
import { MinistriesController } from './ministries.controller';
import { MinistriesService } from './ministries.service';
import { VolunteerProfilesController } from './volunteer-profiles.controller';
import { VolunteerProfilesService } from './volunteer-profiles.service';
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
    SchedulesController,
    AssignmentsController,
    SwapRequestsController,
    CheckinController,
  ],
  providers: [MinistriesService, VolunteerProfilesService, SchedulesService, SwapRequestsService],
  exports: [MinistriesService, VolunteerProfilesService, SchedulesService, SwapRequestsService],
})
export class VolunteersModule {}
