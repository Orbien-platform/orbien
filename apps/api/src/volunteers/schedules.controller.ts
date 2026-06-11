import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { CreateSlotDto } from './dto/create-slot.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { ListSchedulesQueryDto } from './dto/list-schedules-query.dto';

const MANAGE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'ministry_leader'];
const READ_ROLES = [...MANAGE_ROLES, 'secretary'];
const PUBLISH_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];
const DELETE_ROLES = ['admin_congregation', 'tenant_admin'];

@Controller('volunteers/schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  // ── Schedules ──────────────────────────────────────────────────────────────

  @Post()
  @Roles(...MANAGE_ROLES)
  create(@Body() dto: CreateScheduleDto, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.create(user.tenant_id, user.congregation_id, user.sub, dto);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListSchedulesQueryDto, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.findAll(user.tenant_id, user.congregation_id, query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateScheduleDto, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...DELETE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.remove(user.tenant_id, user.congregation_id, id);
  }

  @Post(':id/publish')
  @Roles(...PUBLISH_ROLES)
  publish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.publish(user.tenant_id, user.congregation_id, id);
  }

  @Post(':id/suggest')
  @Roles(...MANAGE_ROLES)
  suggest(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.schedulesService.suggestAssignments(user.tenant_id, user.congregation_id, id);
  }

  // ── Slots ──────────────────────────────────────────────────────────────────

  @Post(':id/slots')
  @Roles(...MANAGE_ROLES)
  createSlot(
    @Param('id') scheduleId: string,
    @Body() dto: CreateSlotDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.schedulesService.createSlot(user.tenant_id, user.congregation_id, scheduleId, dto);
  }

  @Delete(':id/slots/:slotId')
  @Roles(...MANAGE_ROLES)
  removeSlot(
    @Param('id') scheduleId: string,
    @Param('slotId') slotId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.schedulesService.removeSlot(user.tenant_id, user.congregation_id, scheduleId, slotId);
  }

  // ── Assignments ────────────────────────────────────────────────────────────

  @Post(':id/assignments')
  @Roles(...MANAGE_ROLES)
  createAssignment(
    @Param('id') scheduleId: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.schedulesService.createAssignment(user.tenant_id, user.congregation_id, scheduleId, dto);
  }

  @Delete(':id/assignments/:assignId')
  @Roles(...MANAGE_ROLES)
  removeAssignment(
    @Param('id') scheduleId: string,
    @Param('assignId') assignmentId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.schedulesService.removeAssignment(
      user.tenant_id,
      user.congregation_id,
      scheduleId,
      assignmentId,
    );
  }
}
