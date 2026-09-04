import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { ProvisionTenantService } from './provision-tenant.service';
import { ListTenantsService } from './list-tenants.service';
import { ListAuditService } from './list-audit.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [PlatformController],
  providers: [
    ProvisionTenantService,
    ListTenantsService,
    ListAuditService,
    TenantContextInterceptor,
  ],
  exports: [ProvisionTenantService],
})
export class PlatformModule {}
