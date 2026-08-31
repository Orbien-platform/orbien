import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CelebrationInstancesService } from './celebration-instances.service';
import { CreateCelebrationInstanceDto } from './dto/create-celebration-instance.dto';
import { UpdateCelebrationInstanceDto } from './dto/update-celebration-instance.dto';
import { ListCelebrationInstancesQueryDto } from './dto/list-celebration-instances-query.dto';

const WRITE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary'];
const READ_ROLES = [...WRITE_ROLES, 'ministry_leader'];
const DELETE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'];

@Controller('celebrations/instances')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class CelebrationInstancesController {
  constructor(private readonly instancesService: CelebrationInstancesService) {}

  @Post()
  @Roles(...WRITE_ROLES)
  create(@Body() dto: CreateCelebrationInstanceDto, @CurrentUser() user: JwtPayload) {
    return this.instancesService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListCelebrationInstancesQueryDto, @CurrentUser() user: JwtPayload) {
    return this.instancesService.findAll(user.tenant_id, user.congregation_id, query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.instancesService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCelebrationInstanceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.instancesService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...DELETE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.instancesService.remove(user.tenant_id, user.congregation_id, id);
  }
}
