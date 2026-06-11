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

@Module({
  imports: [PrismaModule, ContentModule],
  controllers: [MinistriesController, VolunteerProfilesController, SchedulesController, AssignmentsController],
  providers: [MinistriesService, VolunteerProfilesService, SchedulesService],
  exports: [MinistriesService, VolunteerProfilesService, SchedulesService],
})
export class VolunteersModule {}
