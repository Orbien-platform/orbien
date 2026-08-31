import { Module } from '@nestjs/common';
import { StudyMaterialsController } from './study-materials.controller';
import { StudyMaterialsService } from './study-materials.service';
import { StudyMaterialsScheduler } from './study-materials.scheduler';
import { StorageModule } from '../storage/storage.module';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  imports: [StorageModule],
  controllers: [StudyMaterialsController],
  providers: [StudyMaterialsService, StudyMaterialsScheduler, TenantContextInterceptor],
  exports: [StudyMaterialsService],
})
export class StudyMaterialsModule {}
