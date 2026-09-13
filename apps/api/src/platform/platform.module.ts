import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { ProvisionTenantService } from './provision-tenant.service';
import { ListTenantsService } from './list-tenants.service';
import { ListCrmQueueService } from './list-crm-queue.service';
import { ListAuditLogsService } from './list-audit-logs.service';
import { UpdateTenantService } from './update-tenant.service';
import { SetTenantActiveService } from './set-tenant-active.service';
import { CancelTenantPlanService } from './cancel-tenant-plan.service';
import { TransferUserAccountService } from './transfer-user-account.service';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';

@Module({
  controllers: [PlatformController],
  providers: [
    ProvisionTenantService,
    ListTenantsService,
    ListCrmQueueService,
    ListAuditLogsService,
    UpdateTenantService,
    SetTenantActiveService,
    CancelTenantPlanService,
    TransferUserAccountService,
    TenantContextInterceptor,
  ],
  exports: [ProvisionTenantService],
})
export class PlatformModule {}
