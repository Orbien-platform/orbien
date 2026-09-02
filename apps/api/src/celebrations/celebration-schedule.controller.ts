import { Body, Controller, Delete, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CelebrationScheduleService } from './celebration-schedule.service';
import { AddScheduleMinistryDto } from './dto/add-schedule-ministry.dto';
import { ApplyTemplateDto } from './dto/apply-template.dto';

const MANAGE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'ministry_leader'];

@Controller('celebrations/instances')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class CelebrationScheduleController {
  constructor(private readonly scheduleService: CelebrationScheduleService) {}

  @Post(':instanceId/schedule')
  @Roles(...MANAGE_ROLES)
  createOrGet(@Param('instanceId') instanceId: string, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.createOrGet(user.tenant_id, user.congregation_id, instanceId);
  }

  @Get(':instanceId/schedule')
  @Roles(...MANAGE_ROLES)
  getSchedule(@Param('instanceId') instanceId: string, @CurrentUser() user: JwtPayload) {
    return this.scheduleService.getSchedule(user.tenant_id, user.congregation_id, instanceId);
  }

  @Post(':instanceId/schedule/ministries')
  @Roles(...MANAGE_ROLES)
  addMinistry(
    @Param('instanceId') instanceId: string,
    @Body() dto: AddScheduleMinistryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scheduleService.addMinistry(user.tenant_id, user.congregation_id, instanceId, dto);
  }

  @Delete(':instanceId/schedule/ministries/:ministryId')
  @Roles(...MANAGE_ROLES)
  removeMinistry(
    @Param('instanceId') instanceId: string,
    @Param('ministryId') ministryId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scheduleService.removeMinistry(user.tenant_id, user.congregation_id, instanceId, ministryId);
  }

  @Post(':instanceId/schedule/apply-template')
  @Roles(...MANAGE_ROLES)
  applyTemplate(
    @Param('instanceId') instanceId: string,
    @Body() dto: ApplyTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.scheduleService.applyTemplate(user.tenant_id, user.congregation_id, instanceId, dto);
  }
}
