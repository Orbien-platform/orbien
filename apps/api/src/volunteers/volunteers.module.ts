import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MinistriesController } from './ministries.controller';
import { MinistriesService } from './ministries.service';
import { VolunteerProfilesController } from './volunteer-profiles.controller';
import { VolunteerProfilesService } from './volunteer-profiles.service';

@Module({
  imports: [PrismaModule],
  controllers: [MinistriesController, VolunteerProfilesController],
  providers: [MinistriesService, VolunteerProfilesService],
  exports: [MinistriesService, VolunteerProfilesService],
})
export class VolunteersModule {}
