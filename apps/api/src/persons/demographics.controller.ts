import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DemographicsService } from './demographics.service';
import { DemographicsQueryDto } from './dto/demographics-query.dto';

const DASHBOARD_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'treasurer'];

@Controller('persons')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class DemographicsController {
  constructor(private readonly demographicsService: DemographicsService) {}

  @Get('demographics')
  @Roles(...DASHBOARD_ROLES)
  getStats(@CurrentUser() user: JwtPayload, @Query() query: DemographicsQueryDto) {
    return this.demographicsService.getStats(user, query);
  }
}
