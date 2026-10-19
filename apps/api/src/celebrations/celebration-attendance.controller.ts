import { Body, Controller, Get, Param, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CelebrationAttendanceService } from './celebration-attendance.service';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';
import { VOLUNTEER_ROLES } from './celebration-volunteer.controller';

// Quem lança: escalado (VOLUNTEER_ROLES) ou liderança. O recorte fino — estar
// escalado no ministério responsável — é do service, que olha o banco.
const SAVE_ROLES = [...VOLUNTEER_ROLES, 'secretary'];
// Indicadores são da liderança; `member` e `volunteer` ficam de fora.
const READ_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'];

@Controller('celebrations')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class CelebrationAttendanceController {
  constructor(private readonly attendanceService: CelebrationAttendanceService) {}

  @Put('instances/:id/attendance')
  @Roles(...SAVE_ROLES)
  save(@Param('id') id: string, @Body() dto: SaveAttendanceDto, @CurrentUser() user: JwtPayload) {
    return this.attendanceService.save(id, user, dto);
  }

  @Get('attendance/summary')
  @Roles(...READ_ROLES)
  summary(@Query() query: AttendanceQueryDto, @CurrentUser() user: JwtPayload) {
    return this.attendanceService.summary(user, query);
  }

  @Get('attendance')
  @Roles(...READ_ROLES)
  list(@Query() query: AttendanceQueryDto, @CurrentUser() user: JwtPayload) {
    return this.attendanceService.list(user, query);
  }
}
