import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DreService } from './dre.service';
import { DreQueryDto } from './dto/dre-query.dto';

const DRE_ROLES = ['treasurer', 'admin_congregation', 'pastor', 'tenant_admin'] as const;

@Controller('financial/dre')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class DreController {
  constructor(private readonly dreService: DreService) {}

  @Get()
  @Roles(...DRE_ROLES)
  getDre(@Query() query: DreQueryDto, @CurrentUser() user: JwtPayload) {
    const isPastor = user.roles.includes('pastor') && !user.roles.some((r) => ['admin_congregation', 'tenant_admin', 'treasurer'].includes(r));
    return this.dreService.buildDre(
      user.tenant_id,
      user.congregation_id,
      query,
      isPastor,
    );
  }
}
