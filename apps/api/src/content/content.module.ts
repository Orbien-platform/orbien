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
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [
    SegmentsController,
    PostsController,
    NotificationsController,
    NotificationPreferencesController,
  ],
  providers: [
    SegmentsService,
    PostsService,
    NotificationsService,
    SchedulerService,
    NotificationPreferencesService,
  ],
  exports: [SegmentsService, NotificationsService],
})
export class ContentModule {}
