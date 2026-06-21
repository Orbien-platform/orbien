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
import { MinistriesService } from './ministries.service';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';

const READ_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'];
const WRITE_ROLES = ['admin_congregation', 'tenant_admin'];

@Controller('volunteers/ministries')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class MinistriesController {
  constructor(private readonly ministriesService: MinistriesService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateMinistryDto, @CurrentUser() user: JwtPayload) {
    return this.ministriesService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.ministriesService.findAll(user.tenant_id, user.congregation_id);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ministriesService.findOneWithMembers(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateMinistryDto, @CurrentUser() user: JwtPayload) {
    return this.ministriesService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ministriesService.remove(user.tenant_id, user.congregation_id, id);
  }
}
