import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { ProvisionTenantService } from './provision-tenant.service';
import { ListTenantsService } from './list-tenants.service';
import { ListAuditLogsService } from './list-audit-logs.service';
import { CancelTenantPlanService } from './cancel-tenant-plan.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [PlatformController],
  providers: [
    ProvisionTenantService,
    ListTenantsService,
    ListAuditLogsService,
    CancelTenantPlanService,
    TenantContextInterceptor,
  ],
  exports: [ProvisionTenantService],
})
export class PlatformModule {}
