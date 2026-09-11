import { Module } from '@nestjs/common';
import { PersonsController } from './persons.controller';
import { VisitsController } from './visits.controller';
import { DemographicsController } from './demographics.controller';
import { PersonsService } from './persons.service';
import { ClassificationService } from './classification.service';
import { VisitsService } from './visits.service';
import { DemographicsService } from './demographics.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { StorageModule } from '../storage/storage.module';
import { ContentModule } from '../content/content.module';
import { PersonsImportController } from './import/persons-import.controller';
import { PersonsImportService } from './import/persons-import.service';
import { PersonsRetentionScheduler } from './persons-retention.scheduler';
import { PersonsRetentionNotifier } from './persons-retention-notifier.service';

@Module({
  imports: [StorageModule, ContentModule],
  controllers: [DemographicsController, PersonsController, PersonsImportController, VisitsController],
  providers: [
    PersonsService,
    ClassificationService,
    VisitsService,
    DemographicsService,
    TenantContextInterceptor,
    PersonsImportService,
    PersonsRetentionScheduler,
    PersonsRetentionNotifier,
  ],
  exports: [ClassificationService, VisitsService],
})
export class PersonsModule {}
