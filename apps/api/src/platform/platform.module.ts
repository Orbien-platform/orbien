import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { ProvisionTenantService } from './provision-tenant.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [PlatformController],
  providers: [ProvisionTenantService, TenantContextInterceptor],
  exports: [ProvisionTenantService],
})
export class PlatformModule {}
