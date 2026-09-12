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
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CostCentersService } from './cost-centers.service';
import { CreateCostCenterDto } from './dto/create-cost-center.dto';
import { UpdateCostCenterDto } from './dto/update-cost-center.dto';

// Centros de custo são Starter — `pricing-church-platform.md` §5.2. O que é
// Premium é o balancete que os agrupa (`BalanceteController`), não o cadastro.
@Controller('financial/cost-centers')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class CostCentersController {
  constructor(private readonly costCentersService: CostCentersService) {}

  @Post()
  @Roles('admin_congregation', 'treasurer', 'tenant_admin')
  create(@Body() dto: CreateCostCenterDto, @CurrentUser() user: JwtPayload) {
    return this.costCentersService.create(dto, user);
  }

  @Get()
  @Roles('admin_congregation', 'pastor', 'secretary', 'treasurer', 'tenant_admin')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.costCentersService.findAll(user);
  }

  @Patch(':id')
  @Roles('admin_congregation', 'treasurer', 'tenant_admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCostCenterDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.costCentersService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin_congregation', 'tenant_admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.costCentersService.remove(id, user);
  }
}
