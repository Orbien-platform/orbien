import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { CreateVolunteerProfileDto } from './dto/create-volunteer-profile.dto';
import { UpdateVolunteerProfileDto } from './dto/update-volunteer-profile.dto';

const READ_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'];
const WRITE_ROLES = ['admin_congregation', 'tenant_admin', 'secretary'];
const ADMIN_ROLES = ['admin_congregation', 'tenant_admin'];

@Controller('volunteers/profiles')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class VolunteerProfilesController {
  constructor(private readonly profilesService: VolunteerProfilesService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateVolunteerProfileDto, @CurrentUser() user: JwtPayload) {
    return this.profilesService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.profilesService.findAll(user.tenant_id, user.congregation_id);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.profilesService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVolunteerProfileDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.profilesService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.profilesService.remove(user.tenant_id, user.congregation_id, id);
  }
}
