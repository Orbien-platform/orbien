import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { SmallGroupsService } from './small-groups.service';
import { CreateSmallGroupDto } from './dto/create-small-group.dto';
import { UpdateSmallGroupDto } from './dto/update-small-group.dto';
import { ListSmallGroupsQueryDto } from './dto/list-small-groups-query.dto';
import { AddMemberDto } from './dto/add-member.dto';

const READ_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'treasurer', 'cell_leader'];
const WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];
const MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor'];
const ALERT_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'cell_leader'];

@Controller('small-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SmallGroupsController {
  constructor(private readonly smallGroupsService: SmallGroupsService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateSmallGroupDto, @CurrentUser() user: JwtPayload) {
    return this.smallGroupsService.create(dto, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListSmallGroupsQueryDto) {
    return this.smallGroupsService.findAll(query);
  }

  @Get(':id/hierarchy')
  @Roles(...READ_ROLES)
  getHierarchy(@Param('id', ParseUUIDPipe) id: string) {
    return this.smallGroupsService.getHierarchy(id);
  }

  @Get(':id/absence-alerts')
  @Roles(...ALERT_ROLES)
  checkAbsenceAlerts(@Param('id', ParseUUIDPipe) id: string) {
    return this.smallGroupsService.checkAbsenceAlerts(id);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.smallGroupsService.findOne(id);
  }

  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSmallGroupDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.smallGroupsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('tenant_admin', 'admin_congregation')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.smallGroupsService.remove(id);
  }

  @Post(':id/members')
  @Roles(...WRITE_ROLES)
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.smallGroupsService.addMember(id, dto, user);
  }

  @Delete(':id/members/:personId')
  @Roles(...MANAGE_ROLES)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('personId', ParseUUIDPipe) personId: string,
  ) {
    return this.smallGroupsService.removeMember(id, personId);
  }
}
