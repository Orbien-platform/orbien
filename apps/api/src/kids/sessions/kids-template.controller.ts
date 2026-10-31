import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PlanGuard } from '../../auth/guards/plan.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequiresPlan } from '../../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { KidsTemplateService } from './kids-template.service';
import { SetKidsTemplateDto } from './dto/set-kids-template.dto';
import { ApplyKidsTemplateDto } from './dto/apply-kids-template.dto';
import { KIDS_MANAGE_ROLES, KIDS_READ_ROLES } from '../kids.roles';

// `celebrations/:id/kids-template[/apply]` tem segmento literal depois do `:id`,
// então não é engolido pelo `GET :id` do CelebrationsController (um segmento).
@Controller('celebrations/:id/kids-template')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class KidsTemplateController {
  constructor(private readonly templateService: KidsTemplateService) {}

  @Get()
  @Roles(...KIDS_READ_ROLES)
  get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.templateService.get(user.tenant_id, user.congregation_id, id);
  }

  // Define (substitui) o modelo; lista vazia limpa.
  @Post()
  @Roles(...KIDS_MANAGE_ROLES)
  set(@Param('id') id: string, @Body() dto: SetKidsTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.templateService.set(user.tenant_id, user.congregation_id, id, dto.room_ids);
  }

  @Post('apply')
  @Roles(...KIDS_MANAGE_ROLES)
  apply(@Param('id') id: string, @Body() dto: ApplyKidsTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.templateService.apply(user.tenant_id, user.congregation_id, id, dto);
  }
}
