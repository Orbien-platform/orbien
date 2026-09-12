import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DashboardService } from './dashboard.service';
import { ForecastService } from './forecast.service';

const DASHBOARD_ROLES = ['admin_congregation', 'pastor', 'treasurer', 'tenant_admin'];

@Controller('financial/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly forecastService: ForecastService,
  ) {}

  // `weekly` fica de fora do gate: "Dashboard de entradas semanais" é ✅ nos
  // dois planos em `pricing-church-platform.md` §5.2.
  @Get('weekly')
  @Roles(...DASHBOARD_ROLES)
  getWeekly(@CurrentUser() user: JwtPayload) {
    return this.dashboardService.getWeeklyDashboard(user);
  }

  // "Gráfico de forecast" é Premium — mesma seção.
  @Get('forecast/:months')
  @Roles(...DASHBOARD_ROLES)
  @RequiresPlan('premium')
  getForecast(
    @Param('months', ParseIntPipe) months: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (![3, 6, 12].includes(months)) {
      throw new BadRequestException('months deve ser 3, 6 ou 12');
    }
    return this.forecastService.getForecast(months as 3 | 6 | 12, user);
  }
}
