import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { CelebrationsModule } from './celebrations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentModule } from '../content/content.module';
import { StorageModule } from '../storage/storage.module';
import { CelebrationsService } from './celebrations.service';
import { CelebrationInstancesService } from './celebration-instances.service';
import { ServiceOrdersService } from './service-orders.service';
import { ServiceOrderItemsService } from './service-order-items.service';
import { SetlistsService } from './setlists.service';
import { SetlistSongsService } from './setlist-songs.service';
import { CelebrationSchedulerService } from './celebration-scheduler.service';
import { CelebrationScheduleService } from './celebration-schedule.service';
import { CelebrationAssignmentService } from './celebration-assignment.service';
import { ScheduleTemplateService } from './schedule-template.service';
import { PdfExportService } from './pdf-export.service';

describe('CelebrationsModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        PrismaModule,
        ContentModule,
        StorageModule,
        CelebrationsModule,
      ],
    }).compile();

    expect(moduleRef.get(CelebrationsService)).toBeInstanceOf(CelebrationsService);
    expect(moduleRef.get(CelebrationInstancesService)).toBeInstanceOf(CelebrationInstancesService);
    expect(moduleRef.get(ServiceOrdersService)).toBeInstanceOf(ServiceOrdersService);
    expect(moduleRef.get(ServiceOrderItemsService)).toBeInstanceOf(ServiceOrderItemsService);
    expect(moduleRef.get(SetlistsService)).toBeInstanceOf(SetlistsService);
    expect(moduleRef.get(SetlistSongsService)).toBeInstanceOf(SetlistSongsService);
    expect(moduleRef.get(CelebrationSchedulerService)).toBeInstanceOf(CelebrationSchedulerService);
    expect(moduleRef.get(CelebrationScheduleService)).toBeInstanceOf(CelebrationScheduleService);
    expect(moduleRef.get(CelebrationAssignmentService)).toBeInstanceOf(CelebrationAssignmentService);
    expect(moduleRef.get(ScheduleTemplateService)).toBeInstanceOf(ScheduleTemplateService);
    expect(moduleRef.get(PdfExportService)).toBeInstanceOf(PdfExportService);

    await moduleRef.close();
  });
});
