import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PlanGuard } from '../../auth/guards/plan.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequiresPlan } from '../../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { KidsAttendanceService } from './kids-attendance.service';
import { KidsAttendanceQueryDto } from './dto/kids-attendance-query.dto';
import { KIDS_ATTENDANCE_READ_ROLES } from '../kids.roles';

@Controller('kids/attendance')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class KidsAttendanceController {
  constructor(private readonly attendanceService: KidsAttendanceService) {}

  @Get('summary')
  @Roles(...KIDS_ATTENDANCE_READ_ROLES)
  summary(@Query() query: KidsAttendanceQueryDto, @CurrentUser() user: JwtPayload) {
    return this.attendanceService.summary(user.tenant_id, user.congregation_id, query);
  }
}
