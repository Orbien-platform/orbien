import { Body, Controller, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ServiceOrdersService } from './service-orders.service';
import { PdfExportService } from './pdf-export.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';

const MANAGER_ROLES = ['admin_congregation', 'pastor', 'tenant_admin'] as const;

@Controller('celebrations/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ServiceOrdersController {
  constructor(
    private readonly serviceOrdersService: ServiceOrdersService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  @Post()
  @Roles(...MANAGER_ROLES)
  create(@Body() dto: CreateServiceOrderDto, @CurrentUser() user: JwtPayload) {
    return this.serviceOrdersService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Get(':id')
  @Roles(...MANAGER_ROLES, 'ministry_leader', 'volunteer', 'member')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.serviceOrdersService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Patch(':id')
  @Roles(...MANAGER_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.serviceOrdersService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Post(':id/publish')
  @Roles(...MANAGER_ROLES)
  publish(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.serviceOrdersService.publish(user.tenant_id, user.congregation_id, id);
  }

  @Post(':id/finalize')
  @Roles(...MANAGER_ROLES)
  finalize(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.serviceOrdersService.finalize(user.tenant_id, user.congregation_id, id);
  }

  @Get(':id/pdf')
  @Roles(...MANAGER_ROLES, 'ministry_leader', 'secretary')
  generatePdf(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.pdfExportService.generateServiceOrderPdf(user.tenant_id, user.congregation_id, id);
  }
}
