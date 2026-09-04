import { Test } from '@nestjs/testing';
import { StudyMaterialsModule } from './study-materials.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { StudyMaterialsService } from './study-materials.service';
import { StudyMaterialsScheduler } from './study-materials.scheduler';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

describe('StudyMaterialsModule', () => {
  it('compila e registra todos os providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, StorageModule, StudyMaterialsModule],
    }).compile();

    expect(moduleRef.get(StudyMaterialsService)).toBeInstanceOf(StudyMaterialsService);
    expect(moduleRef.get(StudyMaterialsScheduler)).toBeInstanceOf(StudyMaterialsScheduler);
    expect(moduleRef.get(TenantContextInterceptor)).toBeInstanceOf(TenantContextInterceptor);

    await moduleRef.close();
  });
});
