import { Controller, Get, Param, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SchedulesService } from './schedules.service';

class MyAssignmentsQueryDto {
  @IsOptional() @IsEnum(AssignmentStatus) status?: AssignmentStatus;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  upcoming?: boolean;
}

const VOLUNTEER_ROLES = [
  'volunteer', 'member', 'ministry_leader', 'pastor',
  'admin_congregation', 'tenant_admin',
];

@Controller('volunteers')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class AssignmentsController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post('assignments/:id/confirm')
  @Roles(...VOLUNTEER_ROLES)
  confirm(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.confirm(id, user.sub);
  }

  @Post('assignments/:id/decline')
  @Roles(...VOLUNTEER_ROLES)
  decline(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.decline(id, user.sub);
  }

  @Get('my-assignments')
  @Roles(...VOLUNTEER_ROLES)
  getMyAssignments(@Query() query: MyAssignmentsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.getMyAssignments(
      user.sub,
      user.tenant_id,
      user.congregation_id,
      { status: query.status, upcoming: query.upcoming },
    );
  }
}
