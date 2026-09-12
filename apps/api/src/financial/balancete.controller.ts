import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { BalanceteService } from './balancete.service';
import { BalanceteQueryDto } from './dto/balancete-query.dto';

const BALANCETE_ROLES = ['treasurer', 'admin_congregation', 'pastor', 'tenant_admin'] as const;

// Balancete inteiro é Premium — `pricing-church-platform.md` §5.2, mesma
// tabela que marca "Centros de custo" (o cadastro) como Starter.
@Controller('financial/balancete')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class BalanceteController {
  constructor(private readonly balanceteService: BalanceteService) {}

  @Get()
  @Roles(...BALANCETE_ROLES)
  get(@Query() query: BalanceteQueryDto, @CurrentUser() user: JwtPayload) {
    return this.balanceteService.build(user.tenant_id, query);
  }
}
