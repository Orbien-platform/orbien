import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CelebrationsService } from './celebrations.service';
import { CreateCelebrationDto } from './dto/create-celebration.dto';
import { UpdateCelebrationDto } from './dto/update-celebration.dto';
import { ListCelebrationsQueryDto } from './dto/list-celebrations-query.dto';

const MANAGE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];
const READ_ROLES = [...MANAGE_ROLES, 'secretary', 'ministry_leader'];

@Controller('celebrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class CelebrationsController {
  constructor(private readonly celebrationsService: CelebrationsService) {}

  @Post()
  @Roles(...MANAGE_ROLES)
  create(@Body() dto: CreateCelebrationDto, @CurrentUser() user: JwtPayload) {
    return this.celebrationsService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListCelebrationsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.celebrationsService.findAll(user.tenant_id, user.congregation_id, query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.celebrationsService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  update(@Param('id') id: string, @Body() dto: UpdateCelebrationDto, @CurrentUser() user: JwtPayload) {
    return this.celebrationsService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles('admin_congregation', 'tenant_admin')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.celebrationsService.remove(user.tenant_id, user.congregation_id, id);
  }
}
