import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SegmentsController } from './segments.controller';
import { SegmentsService } from './segments.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [SegmentsController, PostsController, NotificationsController],
  providers: [SegmentsService, PostsService, NotificationsService, SchedulerService],
  exports: [SegmentsService, NotificationsService],
})
export class ContentModule {}
