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
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { NetworksService } from './networks.service';
import { CreateNetworkDto } from './dto/create-network.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { PRODUCT_AREA_READ_ROLES } from '../auth/product-areas';

// Leitura reusa a mesma área de produto de small_groups (design.md).
const READ_ROLES = PRODUCT_AREA_READ_ROLES.small_groups;
const MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor'];

// Rede é 100% Premium (PROD-20, CEL20-07/08) — `@RequiresPlan` de classe,
// mesmo precedente de AuditController/DreController.
@Controller('networks')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class NetworksController {
  constructor(private readonly networksService: NetworksService) {}

  @Post()
  @Roles(...MANAGE_ROLES)
  create(@Body() dto: CreateNetworkDto, @CurrentUser() user: JwtPayload) {
    return this.networksService.create(dto, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll() {
    return this.networksService.findAll();
  }

  @Get(':id/goal-status')
  @Roles(...READ_ROLES)
  getGoalStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.networksService.getGoalStatus(id);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.networksService.findOne(id);
  }

  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNetworkDto) {
    return this.networksService.update(id, dto);
  }

  @Delete(':id')
  @Roles(...MANAGE_ROLES)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.networksService.remove(id);
  }
}
