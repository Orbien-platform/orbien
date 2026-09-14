import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PRODUCT_AREA_READ_ROLES } from '../auth/product-areas';
import { TenantAuditLogsService } from './tenant-audit-logs.service';
import { ListTenantAuditLogsQueryDto } from './dto/list-tenant-audit-logs-query.dto';

const READ_ROLES = PRODUCT_AREA_READ_ROLES.audit;

/**
 * `PROD-21` — a auditoria do ponto de vista da igreja.
 *
 * Rota de **tenant**, não de plataforma: passa pelo `TenantContextInterceptor`
 * como qualquer outra tela do produto, e é o RLS que recorta as linhas. Nada
 * de `@PlatformRoute()` aqui — quem lê acima dos tenants é o `apps/admin`, por
 * `GET /platform/audit-logs`.
 *
 * `tenant_admin` sozinho, e Premium: é o recorte do `PROD-21` e da matriz de
 * `pricing-church-platform.md`. A lista de papéis mora em `product-areas.ts`
 * junto com as outras seis áreas, porque é dela que `GET /me/permissions`
 * responde — é assim que a barra lateral do web sabe se desenha o link.
 */
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class AuditController {
  constructor(private readonly tenantAuditLogs: TenantAuditLogsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(@Query() query: ListTenantAuditLogsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.tenantAuditLogs.list(user.tenant_id, query);
  }
}
