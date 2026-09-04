import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformRoute } from '../common/decorators/platform-route.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { ProvisionTenantService, ProvisionedTenant } from './provision-tenant.service';
import { ListTenantsService, TenantListPage } from './list-tenants.service';
import { ListAuditService, AuditListPage } from './list-audit.service';
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';

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
    private readonly listAudit: ListAuditService,
  ) {}

  @Get('tenants')
  list(@Query() query: ListTenantsQueryDto): Promise<TenantListPage> {
    return this.listTenants.list(query);
  }

  /**
   * O rastro que a própria plataforma deixa: `support_access` (sessão de
   * suporte dentro de um tenant) e `platform_access` (rota acima deles).
   *
   * Só enxerga essas duas ações, e quem decide isso é a policy de
   * `005_rls_audit_platform.sql`, não o filtro do serviço. O resto do
   * `audit_logs` de uma igreja continua fora do alcance da plataforma.
   */
  @Get('audit')
  audit(@Query() query: ListAuditQueryDto): Promise<AuditListPage> {
    return this.listAudit.list(query);
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  provision(@Body() dto: ProvisionTenantDto): Promise<ProvisionedTenant> {
    return this.provisionTenant.provision(dto);
  }
}
