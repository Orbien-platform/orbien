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
import { ScheduleTemplateService } from './schedule-template.service';
import { CreateScheduleTemplateDto } from './dto/create-schedule-template.dto';
import { UpdateScheduleTemplateDto } from './dto/update-schedule-template.dto';

// Mesmas roles que montam escala: quem usa o template é quem o mantém.
const MANAGE_ROLES = ['admin_congregation', 'pastor', 'tenant_admin', 'ministry_leader'];

@Controller('celebrations/schedule-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ScheduleTemplateController {
  constructor(private readonly templateService: ScheduleTemplateService) {}

  @Get()
  @Roles(...MANAGE_ROLES)
  findAll(@CurrentUser() user: JwtPayload) {
    return this.templateService.findAll(user.tenant_id, user.congregation_id);
  }

  @Get(':id')
  @Roles(...MANAGE_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.templateService.findOne(user.tenant_id, user.congregation_id, id);
  }

  @Post()
  @Roles(...MANAGE_ROLES)
  create(@Body() dto: CreateScheduleTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.templateService.create(user.tenant_id, user.congregation_id, dto);
  }

  @Patch(':id')
  @Roles(...MANAGE_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.templateService.update(user.tenant_id, user.congregation_id, id, dto);
  }

  @Delete(':id')
  @Roles(...MANAGE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.templateService.remove(user.tenant_id, user.congregation_id, id);
  }
}
