import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { PixModule } from '../financial/pix.module';
import { SegmentsController } from './segments.controller';
import { SegmentsService } from './segments.service';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { SchedulerService } from './scheduler.service';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationPreferencesService } from './notification-preferences.service';
import { EventRegistrationsController } from './event-registrations.controller';
import { EventRegistrationsService } from './event-registrations.service';

@Module({
  // PixModule (não `FinancialModule` inteiro — ver o cabeçalho de
  // `pix.module.ts`): inscrição paga (PROD-24) chama `PixService` para gerar
  // o QR do PIX dinâmico. Sentido único — nem `PixModule` nem
  // `FinancialModule` importam `ContentModule` de volta.
  imports: [PrismaModule, StorageModule, PixModule],
  controllers: [
    SegmentsController,
    PostsController,
    NotificationsController,
    NotificationPreferencesController,
    EventRegistrationsController,
  ],
  providers: [
    SegmentsService,
    PostsService,
    NotificationsService,
    SchedulerService,
    NotificationPreferencesService,
    EventRegistrationsService,
  ],
  exports: [SegmentsService, NotificationsService],
})
export class ContentModule {}
