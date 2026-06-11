import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MinistriesController } from './ministries.controller';
import { MinistriesService } from './ministries.service';
import { VolunteerProfilesController } from './volunteer-profiles.controller';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  imports: [PrismaModule],
  controllers: [MinistriesController, VolunteerProfilesController, SchedulesController],
  providers: [MinistriesService, VolunteerProfilesService, SchedulesService],
  exports: [MinistriesService, VolunteerProfilesService, SchedulesService],
})
export class VolunteersModule {}
