import { Test } from '@nestjs/testing';
import { ContentModule } from './content.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SegmentsService } from './segments.service';
import { PostsService } from './posts.service';
import { NotificationsService } from './notifications.service';
import { SchedulerService } from './scheduler.service';

describe('ContentModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, StorageModule, ContentModule],
    }).compile();

    expect(moduleRef.get(SegmentsService)).toBeInstanceOf(SegmentsService);
    expect(moduleRef.get(PostsService)).toBeInstanceOf(PostsService);
    expect(moduleRef.get(NotificationsService)).toBeInstanceOf(NotificationsService);
    expect(moduleRef.get(SchedulerService)).toBeInstanceOf(SchedulerService);

    await moduleRef.close();
  });
});
