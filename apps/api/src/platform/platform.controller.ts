import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { TenantPlan } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformRoute } from '../common/decorators/platform-route.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { ProvisionTenantService, ProvisionedTenant } from './provision-tenant.service';
import { ListTenantsService, TenantListPage } from './list-tenants.service';
import { ListCrmQueueService, CrmQueue } from './list-crm-queue.service';
import { ListAuditLogsService, AuditLogPage } from './list-audit-logs.service';
import { UpdateTenantService, UpdatedTenant } from './update-tenant.service';
import { SetTenantActiveService, TenantActiveState } from './set-tenant-active.service';
import { CancelTenantPlanService } from './cancel-tenant-plan.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

/**
 * Plano de plataforma: opera acima dos tenants, não dentro de um.
 *
 * As três marcas trabalham juntas e nenhuma delas basta sozinha —
 * `@Roles('platform_support')` barra quem não é suporte, `@PlatformRoute()`
 * diz ao interceptor para não fixar tenant, e o interceptor troca para
 * `app_user` para que o RLS seja de fato avaliado. Tirar qualquer uma
 * degrada em silêncio: sem o decorator a rota lista zero tenants; sem o
 * interceptor ela roda como `orbien_app` e lista todos, papel nenhum.
 */
@Controller('platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
@Roles('platform_support')
@PlatformRoute()
export class PlatformController {
  constructor(
    private readonly provisionTenant: ProvisionTenantService,
    private readonly listTenants: ListTenantsService,
    private readonly listCrmQueue: ListCrmQueueService,
    private readonly listAuditLogs: ListAuditLogsService,
    private readonly updateTenant: UpdateTenantService,
    private readonly setTenantActive: SetTenantActiveService,
    private readonly cancelTenantPlan: CancelTenantPlanService,
  ) {}

  @Get('tenants')
  list(@Query() query: ListTenantsQueryDto): Promise<TenantListPage> {
    return this.listTenants.list(query);
  }

  // PROD-06 — fila CRM: trials expirados sem conversão e tenants inadimplentes.
  @Get('tenants/crm-queue')
  crmQueue(): Promise<CrmQueue> {
    return this.listCrmQueue.list();
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  provision(@Body() dto: ProvisionTenantDto): Promise<ProvisionedTenant> {
    return this.provisionTenant.provision(dto);
  }

  @Patch('tenants/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<UpdatedTenant> {
    return this.updateTenant.update(id, dto);
  }

  @Patch('tenants/:id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string): Promise<TenantActiveState> {
    return this.setTenantActive.setActive(id, false);
  }

  @Patch('tenants/:id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string): Promise<TenantActiveState> {
    return this.setTenantActive.setActive(id, true);
  }

  // Fixa em `support_access` — ver o cabeçalho de `ListAuditLogsService`.
  @Get('audit-logs/support-access')
  listSupportAccess(@Query() query: ListAuditLogsQueryDto): Promise<AuditLogPage> {
    return this.listAuditLogs.list(query);
  }

  // Marca o fim do contrato (`tenant_plans.cancelled_at`) — é o que os jobs
  // de retenção da seção 5 (LGPD) usam pra calcular as janelas de 5 anos
  // (financeiro) e 30 dias (menor). Ver CancelTenantPlanService.
  @Post('tenants/:id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<TenantPlan> {
    return this.cancelTenantPlan.cancel(id);
  }

  @Post('tenants/:id/reactivate')
  reactivate(@Param('id', ParseUUIDPipe) id: string): Promise<TenantPlan> {
    return this.cancelTenantPlan.reactivate(id);
  }
}
