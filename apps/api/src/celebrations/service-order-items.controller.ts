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
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ServiceOrderItemsService } from './service-order-items.service';
import { CreateServiceOrderItemDto } from './dto/create-service-order-item.dto';
import { UpdateServiceOrderItemDto } from './dto/update-service-order-item.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';

const MANAGER_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'] as const;

@Controller('celebrations/items')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ServiceOrderItemsController {
  constructor(private readonly serviceOrderItemsService: ServiceOrderItemsService) {}

  @Post()
  @Roles(...MANAGER_ROLES, 'ministry_leader')
  create(@Body() dto: CreateServiceOrderItemDto, @CurrentUser() user: JwtPayload) {
    return this.serviceOrderItemsService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get()
  @Roles(...MANAGER_ROLES, 'ministry_leader', 'volunteer', 'member')
  findAll(@Query('service_order_id') serviceOrderId: string, @CurrentUser() user: JwtPayload) {
    return this.serviceOrderItemsService.findAll(user.tenant_id, user.congregation_id, serviceOrderId);
  }

  @Get(':id')
  @Roles(...MANAGER_ROLES, 'ministry_leader', 'volunteer', 'member')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.serviceOrderItemsService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...MANAGER_ROLES, 'ministry_leader')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceOrderItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.serviceOrderItemsService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...MANAGER_ROLES, 'ministry_leader')
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.serviceOrderItemsService.remove(user.tenant_id, user.congregation_id, id);
  }

  @Post('reorder')
  @Roles(...MANAGER_ROLES, 'ministry_leader')
  reorder(@Body() dto: ReorderItemsDto, @CurrentUser() user: JwtPayload) {
    return this.serviceOrderItemsService.reorder(user.tenant_id, user.congregation_id, dto);
  }
}
