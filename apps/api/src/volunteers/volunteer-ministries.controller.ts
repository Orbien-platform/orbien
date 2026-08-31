import {
  Body,
  Controller,
  Delete,
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
import { VolunteerMinistriesService } from './volunteer-ministries.service';
import { CreateVolunteerMinistryDto } from './dto/create-volunteer-ministry.dto';
import { UpdateVolunteerMinistryDto } from './dto/update-volunteer-ministry.dto';

const WRITE_ROLES = ['admin_congregation', 'tenant_admin', 'secretary'];

@Controller('volunteers/ministry-assignments')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class VolunteerMinistriesController {
  constructor(private readonly volunteerMinistriesService: VolunteerMinistriesService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  assignToMinistry(@Body() dto: CreateVolunteerMinistryDto, @CurrentUser() user: JwtPayload) {
    return this.volunteerMinistriesService.assignToMinistry(user.tenant_id, user.congregation_id, dto);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVolunteerMinistryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.volunteerMinistriesService.updateAssignment(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.volunteerMinistriesService.remove(user.tenant_id, user.congregation_id, id);
  }
}
