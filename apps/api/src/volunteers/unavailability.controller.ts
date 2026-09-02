import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UnavailabilityService } from './unavailability.service';
import { CreateUnavailabilityDto } from './dto/create-unavailability.dto';
import { UnavailabilityQueryDto } from './dto/unavailability-query.dto';
import { MinistryAvailabilityQueryDto } from './dto/ministry-availability-query.dto';

const VOLUNTEER_ROLES = [
  'volunteer',
  'member',
  'ministry_leader',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

const LEADER_ROLES = ['ministry_leader', 'admin_congregation', 'tenant_admin'];

@Controller('volunteers')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class UnavailabilityController {
  constructor(private readonly unavailabilityService: UnavailabilityService) {}

  @Post('unavailability')
  @Roles(...VOLUNTEER_ROLES)
  upsert(@Body() dto: CreateUnavailabilityDto, @CurrentUser() user: JwtPayload) {
    return this.unavailabilityService.upsert(user.sub, user.tenant_id, user.congregation_id, dto);
  }

  @Get('unavailability')
  @Roles(...VOLUNTEER_ROLES)
  getMyUnavailability(@Query() query: UnavailabilityQueryDto, @CurrentUser() user: JwtPayload) {
    return this.unavailabilityService.getMyUnavailability(
      user.sub,
      user.tenant_id,
      user.congregation_id,
      query.month,
      query.year,
    );
  }

  @Get('ministries/:id/availability')
  @Roles(...LEADER_ROLES)
  getMinistryAvailability(
    @Param('id') ministryId: string,
    @Query() query: MinistryAvailabilityQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.unavailabilityService.getMinistryAvailability(
      user.sub,
      user.roles,
      user.tenant_id,
      user.congregation_id,
      ministryId,
      query.date,
    );
  }
}
