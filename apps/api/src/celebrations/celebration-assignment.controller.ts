import { Body, Controller, Delete, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CelebrationAssignmentService } from './celebration-assignment.service';
import { AddCelebrationAssignmentDto } from './dto/add-celebration-assignment.dto';

// ministry_leader is allowed but the service enforces they must be leader of THAT ministry
const ASSIGNMENT_ROLES = ['ministry_leader', 'admin_congregation', 'tenant_admin'];
const PUBLISH_ROLES = ['admin_congregation', 'tenant_admin', 'pastor'];

@Controller('celebrations/instances')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class CelebrationAssignmentController {
  constructor(private readonly assignmentService: CelebrationAssignmentService) {}

  @Post(':instanceId/schedule/ministries/:ministryId/assignments')
  @Roles(...ASSIGNMENT_ROLES)
  createAssignment(
    @Param('instanceId') instanceId: string,
    @Param('ministryId') celebrationMinistryId: string,
    @Body() dto: AddCelebrationAssignmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assignmentService.createAssignment(
      user.tenant_id,
      user.congregation_id,
      instanceId,
      celebrationMinistryId,
      user.sub,
      user.roles,
      dto,
    );
  }

  @Delete(':instanceId/schedule/ministries/:ministryId/assignments/:assignmentId')
  @Roles(...ASSIGNMENT_ROLES)
  removeAssignment(
    @Param('instanceId') instanceId: string,
    @Param('ministryId') celebrationMinistryId: string,
    @Param('assignmentId') assignmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.assignmentService.removeAssignment(
      user.tenant_id,
      user.congregation_id,
      instanceId,
      celebrationMinistryId,
      assignmentId,
      user.sub,
      user.roles,
    );
  }

  @Patch(':instanceId/schedule/publish')
  @Roles(...PUBLISH_ROLES)
  publish(@Param('instanceId') instanceId: string, @CurrentUser() user: JwtPayload) {
    return this.assignmentService.publish(user.tenant_id, user.congregation_id, instanceId);
  }
}
