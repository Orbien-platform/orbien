import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { CreateMeetingMaterialDto } from './dto/create-meeting-material.dto';

const MEETING_WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'cell_leader'];
const MEETING_READ_ROLES = [...MEETING_WRITE_ROLES, 'treasurer'];
const MEETING_ADMIN_ROLES = ['tenant_admin', 'admin_congregation', 'pastor'];
const MATERIAL_WRITE_ROLES = ['cell_leader', 'admin_congregation', 'tenant_admin'];
const MATERIAL_READ_ROLES = ['member', ...MATERIAL_WRITE_ROLES];

@Controller('small-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post('meetings')
  @Roles(...MEETING_WRITE_ROLES)
  create(@Body() dto: CreateMeetingDto, @CurrentUser() user: JwtPayload) {
    return this.meetingsService.create(dto, user);
  }

  @Get('meetings/:meetingId')
  @Roles(...MEETING_READ_ROLES)
  findOne(@Param('meetingId', ParseUUIDPipe) meetingId: string) {
    return this.meetingsService.findOne(meetingId);
  }

  @Patch('meetings/:meetingId')
  @Roles(...MEETING_WRITE_ROLES)
  update(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingsService.update(meetingId, dto);
  }

  @Get(':groupId/meetings')
  @Roles(...MEETING_READ_ROLES)
  findByGroup(@Param('groupId', ParseUUIDPipe) groupId: string) {
    return this.meetingsService.findByGroup(groupId);
  }

  @Post('meetings/:meetingId/attendance')
  @Roles(...MEETING_WRITE_ROLES)
  recordAttendance(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: RecordAttendanceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.recordAttendance(meetingId, dto, user);
  }

  @Delete('meetings/:meetingId/attendance/:personId')
  @Roles(...MEETING_ADMIN_ROLES)
  removeAttendance(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('personId', ParseUUIDPipe) personId: string,
  ) {
    return this.meetingsService.removeAttendance(meetingId, personId);
  }

  @Post('meetings/:meetingId/materials')
  @Roles(...MATERIAL_WRITE_ROLES)
  addMaterial(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: CreateMeetingMaterialDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.addMaterial(meetingId, dto, user);
  }

  @Get('meetings/:meetingId/materials')
  @Roles(...MATERIAL_READ_ROLES)
  listMaterials(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.listMaterials(meetingId, user);
  }

  @Delete('meetings/:meetingId/materials/:materialId')
  @Roles(...MATERIAL_WRITE_ROLES)
  removeMaterial(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
  ) {
    return this.meetingsService.removeMaterial(meetingId, materialId);
  }
}
