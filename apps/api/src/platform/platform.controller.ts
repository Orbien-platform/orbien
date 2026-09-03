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
import { ProvisionTenantDto } from './dto/provision-tenant.dto';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';

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
  ) {}

  @Get('tenants')
  list(@Query() query: ListTenantsQueryDto): Promise<TenantListPage> {
    return this.listTenants.list(query);
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  provision(@Body() dto: ProvisionTenantDto): Promise<ProvisionedTenant> {
    return this.provisionTenant.provision(dto);
  }
}
