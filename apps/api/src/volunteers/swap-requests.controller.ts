import { Body, Controller, Delete, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SwapRequestsService } from './swap-requests.service';
import { CreateSwapRequestDto } from './dto/create-swap-request.dto';

const VOLUNTEER_ROLES = [
  'volunteer', 'member', 'ministry_leader', 'pastor',
  'admin_congregation', 'tenant_admin',
];

const MANAGER_ROLES = ['ministry_leader', 'pastor', 'admin_congregation', 'tenant_admin'];

@Controller('volunteers/swaps')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class SwapRequestsController {
  constructor(private readonly swapRequestsService: SwapRequestsService) {}

  @Post()
  @Roles(...VOLUNTEER_ROLES)
  create(@Body() dto: CreateSwapRequestDto, @CurrentUser() user: JwtPayload) {
    return this.swapRequestsService.create(user.sub, dto);
  }

  @Post(':id/accept')
  @Roles(...VOLUNTEER_ROLES)
  accept(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.swapRequestsService.accept(user.sub, id);
  }

  @Post(':id/reject')
  @Roles(...VOLUNTEER_ROLES)
  reject(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.swapRequestsService.reject(user.sub, id);
  }

  @Delete(':id')
  @Roles(...VOLUNTEER_ROLES)
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.swapRequestsService.cancel(user.sub, id);
  }

  @Get()
  @Roles(...MANAGER_ROLES)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.swapRequestsService.findAll(user.tenant_id, user.congregation_id);
  }
}
