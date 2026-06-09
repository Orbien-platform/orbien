import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SegmentsController } from './segments.controller';
import { SegmentsService } from './segments.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { NotificationsService } from './notifications.service';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [PrismaModule],
  controllers: [SegmentsController, PostsController],
  providers: [SegmentsService, PostsService, NotificationsService, SchedulerService],
  exports: [SegmentsService],
})
export class ContentModule {}
