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
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ServiceOrderTemplatesService } from './service-order-templates.service';
import { CreateServiceOrderTemplateDto } from './dto/create-service-order-template.dto';
import { UpdateServiceOrderTemplateDto } from './dto/update-service-order-template.dto';
import { ApplyServiceOrderTemplateDto } from './dto/apply-service-order-template.dto';

// Mesmas roles que montam a OC (`ServiceOrdersController`): quem usa o molde é
// quem monta a ordem de culto.
const MANAGER_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'] as const;

@Controller('celebrations/order-templates')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class ServiceOrderTemplatesController {
  constructor(private readonly templatesService: ServiceOrderTemplatesService) {}

  @Get()
  @Roles(...MANAGER_ROLES)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.templatesService.findAll(user.tenant_id, user.congregation_id);
  }

  @Post()
  @Roles(...MANAGER_ROLES)
  create(@Body() dto: CreateServiceOrderTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.templatesService.createFromOrder(user.tenant_id, user.congregation_id, dto);
  }

  @Patch(':id')
  @Roles(...MANAGER_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceOrderTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.templatesService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...MANAGER_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.templatesService.remove(user.tenant_id, user.congregation_id, id);
  }

  @Post(':id/apply')
  @Roles(...MANAGER_ROLES)
  apply(
    @Param('id') id: string,
    @Body() dto: ApplyServiceOrderTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.templatesService.apply(user.tenant_id, user.congregation_id, id, dto);
  }
}
