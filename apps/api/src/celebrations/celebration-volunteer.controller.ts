import { Body, Controller, Get, Param, Patch, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CelebrationAssignmentService } from './celebration-assignment.service';
import { RespondCelebrationAssignmentDto } from './dto/respond-celebration-assignment.dto';
import { MyAssignmentsQueryDto } from './dto/my-assignments-query.dto';

const VOLUNTEER_ROLES = [
  'volunteer',
  'member',
  'ministry_leader',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

@Controller('assignments')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class CelebrationRespondController {
  constructor(private readonly assignmentService: CelebrationAssignmentService) {}

  @Patch(':id/respond')
  @Roles(...VOLUNTEER_ROLES)
  respond(
    @Param('id') id: string,
    @Body() dto: RespondCelebrationAssignmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assignmentService.respondToAssignment(id, user.sub, user.tenant_id, dto);
  }

  @Patch(':id/check-in')
  @Roles(...VOLUNTEER_ROLES)
  checkIn(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.assignmentService.checkInAssignment(id, user.sub, user.tenant_id);
  }
}

@Controller('volunteers')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class CelebrationMyAssignmentsController {
  constructor(private readonly assignmentService: CelebrationAssignmentService) {}

  @Get('my-celebration-assignments')
  @Roles(...VOLUNTEER_ROLES)
  getMyAssignments(@Query() query: MyAssignmentsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.assignmentService.getMyAssignments(
      user.sub,
      user.tenant_id,
      user.congregation_id,
      query.includePast ?? false,
    );
  }
}
