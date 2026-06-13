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
import { PersonsImportController } from './import/persons-import.controller';
import { PersonsImportService } from './import/persons-import.service';

@Module({
  imports: [StorageModule],
  controllers: [DemographicsController, PersonsController, PersonsImportController, VisitsController],
  providers: [PersonsService, ClassificationService, VisitsService, DemographicsService, TenantContextInterceptor, PersonsImportService],
  exports: [ClassificationService, VisitsService],
})
export class PersonsModule {}
