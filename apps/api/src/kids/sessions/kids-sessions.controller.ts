import { Body, Controller, Delete, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PlanGuard } from '../../auth/guards/plan.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequiresPlan } from '../../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { KidsSessionsService } from './kids-sessions.service';
import { OpenKidsSessionsDto } from './dto/open-kids-sessions.dto';
import { KIDS_FAMILY_ROLES, KIDS_MANAGE_ROLES, KIDS_READ_ROLES } from '../kids.roles';
import { toKidsActor } from '../children/kids-child-access.service';

// Caminhos completos nos métodos, e não no `@Controller`: a sessão é filha da
// instância de celebração na abertura (`celebrations/instances/:id/...`) e
// raiz própria no cancelamento (`kids/sessions/:id`). Nenhum dos dois casa com
// o `GET :id` de `CelebrationsController`/`CelebrationInstancesController`
// (um segmento só), então a ordem dos controllers entre módulos não importa.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class KidsSessionsController {
  constructor(private readonly sessionsService: KidsSessionsService) {}

  // Rota literal ANTES de qualquer `kids/sessions/:id`: o Nest casa na ordem de
  // declaração, então `open` nunca vira um `:id`.
  @Get('kids/sessions/open')
  @Roles(...KIDS_FAMILY_ROLES, 'volunteer')
  listOpen(@CurrentUser() user: JwtPayload) {
    return this.sessionsService.listOpenToday(toKidsActor(user));
  }

  @Get('celebrations/instances/:id/kids-sessions')
  @Roles(...KIDS_READ_ROLES)
  list(@Param('id') instanceId: string, @CurrentUser() user: JwtPayload) {
    return this.sessionsService.listByInstance(user.tenant_id, user.congregation_id, instanceId);
  }

  @Post('celebrations/instances/:id/kids-sessions')
  @Roles(...KIDS_MANAGE_ROLES)
  open(@Param('id') instanceId: string, @Body() dto: OpenKidsSessionsDto, @CurrentUser() user: JwtPayload) {
    return this.sessionsService.open(user.tenant_id, user.congregation_id, instanceId, dto.room_ids);
  }

  @Delete('kids/sessions/:id')
  @Roles(...KIDS_MANAGE_ROLES)
  cancel(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.sessionsService.cancel(user.tenant_id, user.congregation_id, id);
  }
}
