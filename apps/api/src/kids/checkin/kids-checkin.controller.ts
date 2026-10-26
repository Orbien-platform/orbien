import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PlanGuard } from '../../auth/guards/plan.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequiresPlan } from '../../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { KIDS_FAMILY_ROLES, KIDS_MANAGE_ROLES, KIDS_READ_ROLES } from '../kids.roles';
import { toKidsActor } from '../children/kids-child-access.service';
import { KidsCheckinService } from './kids-checkin.service';
import { KidsRosterService } from './kids-roster.service';
import { CreateKidsCheckinDto } from './dto/create-kids-checkin.dto';
import { CheckoutKidsCheckinDto } from './dto/checkout-kids-checkin.dto';
import { CheckoutOverrideKidsCheckinDto } from './dto/checkout-override-kids-checkin.dto';

// Caminhos completos nos métodos (mesmo motivo de KidsSessionsController): o
// check-in é filho da sessão e o check-out, raiz própria. O recorte fino —
// voluntário só na sessão em que está escalado, responsável só o próprio filho
// — mora no service; o `@Roles` é a rejeição barata.
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class KidsCheckinController {
  constructor(
    private readonly checkinService: KidsCheckinService,
    private readonly rosterService: KidsRosterService,
  ) {}

  // Equipe, voluntário escalado ou o responsável (só do próprio filho, pelo app).
  @Post('kids/sessions/:id/checkins')
  @Roles(...KIDS_FAMILY_ROLES, 'volunteer')
  checkIn(@Param('id', ParseUUIDPipe) sessionId: string, @Body() dto: CreateKidsCheckinDto, @CurrentUser() user: JwtPayload) {
    return this.checkinService.checkIn(toKidsActor(user), sessionId, dto);
  }

  // Check-out é ação da equipe: o responsável não fecha o próprio check-in.
  @Post('kids/checkins/:id/checkout')
  @HttpCode(200)
  @Roles(...KIDS_READ_ROLES)
  checkOut(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CheckoutKidsCheckinDto, @CurrentUser() user: JwtPayload) {
    return this.checkinService.checkOut(toKidsActor(user), id, dto);
  }

  @Post('kids/checkins/:id/checkout-override')
  @HttpCode(200)
  @Roles(...KIDS_MANAGE_ROLES)
  checkOutOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckoutOverrideKidsCheckinDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.checkinService.checkOutOverride(toKidsActor(user), id, dto);
  }

  @Get('kids/sessions/:id/roster')
  @Roles(...KIDS_READ_ROLES)
  roster(@Param('id', ParseUUIDPipe) sessionId: string, @CurrentUser() user: JwtPayload) {
    return this.rosterService.roster(toKidsActor(user), sessionId);
  }
}
