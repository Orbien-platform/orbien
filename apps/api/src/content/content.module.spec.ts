import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ContentModule } from './content.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SegmentsService } from './segments.service';
import { PostsService } from './posts.service';
import { NotificationsService } from './notifications.service';
import { SchedulerService } from './scheduler.service';
import { NotificationPreferencesService } from './notification-preferences.service';

describe('ContentModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        PrismaModule,
        StorageModule,
        ContentModule,
      ],
    }).compile();

    expect(moduleRef.get(SegmentsService)).toBeInstanceOf(SegmentsService);
    expect(moduleRef.get(PostsService)).toBeInstanceOf(PostsService);
    expect(moduleRef.get(NotificationsService)).toBeInstanceOf(NotificationsService);
    expect(moduleRef.get(SchedulerService)).toBeInstanceOf(SchedulerService);
    expect(moduleRef.get(NotificationPreferencesService)).toBeInstanceOf(
      NotificationPreferencesService,
    );

    await moduleRef.close();
  });
});
