import { Module } from '@nestjs/common';
import { PersonsController } from './persons.controller';
import { VisitsController } from './visits.controller';
import { PersonsService } from './persons.service';
import { ClassificationService } from './classification.service';
import { VisitsService } from './visits.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [PersonsController, VisitsController],
  providers: [PersonsService, ClassificationService, VisitsService, TenantContextInterceptor],
  exports: [ClassificationService, VisitsService],
})
export class PersonsModule {}
