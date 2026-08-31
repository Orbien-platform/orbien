import { Body, Controller, Delete, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SetlistsService } from './setlists.service';
import { CreateSetlistDto } from './dto/create-setlist.dto';

const EDIT_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'secretary', 'ministry_leader'] as const;
const DELETE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'] as const;

@Controller('celebrations/setlists')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SetlistsController {
  constructor(private readonly setlistsService: SetlistsService) {}

  @Post()
  @Roles(...EDIT_ROLES)
  create(@Body() dto: CreateSetlistDto, @CurrentUser() user: JwtPayload) {
    return this.setlistsService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get(':id')
  @Roles(...EDIT_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.setlistsService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Delete(':id')
  @Roles(...DELETE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.setlistsService.remove(user.tenant_id, user.congregation_id, id);
  }
}
