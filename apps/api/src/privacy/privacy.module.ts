import { Module } from '@nestjs/common';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { MePrivacyController } from './me-privacy.controller';
import { MePrivacyService } from './me-privacy.service';

@Module({
  controllers: [MePrivacyController],
  providers: [MePrivacyService, TenantContextInterceptor],
})
export class PrivacyModule {}
