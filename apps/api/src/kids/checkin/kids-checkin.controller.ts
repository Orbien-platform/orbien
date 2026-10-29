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
import { KidsLabelsService } from './kids-labels.service';
import { CreateKidsCheckinDto } from './dto/create-kids-checkin.dto';
import { CheckoutKidsCheckinDto } from './dto/checkout-kids-checkin.dto';
import { CheckoutOverrideKidsCheckinDto } from './dto/checkout-override-kids-checkin.dto';
import { CheckinByQrKidsCheckinDto } from './dto/checkin-by-qr-kids-checkin.dto';
import { KidsQrService } from './kids-qr.service';

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
    private readonly labelsService: KidsLabelsService,
    private readonly qrService: KidsQrService,
  ) {}

  // Equipe, voluntário escalado ou o responsável (só do próprio filho, pelo app).
  @Post('kids/sessions/:id/checkins')
  @Roles(...KIDS_FAMILY_ROLES, 'volunteer')
  async checkIn(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: CreateKidsCheckinDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const actor = toKidsActor(user);
    const checkin = await this.checkinService.checkIn(actor, sessionId, dto);
    // AC 5: as duas etiquetas saem junto com o código.
    return { ...checkin, labels: await this.labelsService.forCheckin(actor, checkin.id) };
  }

  // R3-1: a equipe lê o QR emitido pelo app do responsável. Criança e quem entrega
  // vêm do QR; quem recebe é o usuário que leu. Mesmas regras do check-in normal.
  // Só quem opera a sessão (gestão, voluntário escalado): o responsável emite o
  // QR, não o lê.
  @Post('kids/sessions/:id/checkins/by-qr')
  @Roles(...KIDS_READ_ROLES)
  async checkInByQr(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Body() dto: CheckinByQrKidsCheckinDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const actor = toKidsActor(user);
    const checkin = await this.checkinService.checkInByQr(actor, sessionId, dto);
    return { ...checkin, labels: await this.labelsService.forCheckin(actor, checkin.id) };
  }

  // R3-1: QR de check-in de curta duração e uso único, emitido para o responsável
  // do próprio Household. Papéis de família; o recorte (ser responsável DESTA
  // criança, sem atalho de gestão) é do service.
  @Post('kids/children/:id/qr')
  @Roles(...KIDS_FAMILY_ROLES)
  issueQr(@Param('id', ParseUUIDPipe) childId: string, @CurrentUser() user: JwtPayload) {
    return this.qrService.issueCheckin(toKidsActor(user), childId);
  }

  // Reimpressão: o service só entrega a quem fez o check-in e enquanto ele está
  // aberto (AC 7: a equipe não relê o código depois). O papel aqui é rejeição barata.
  @Get('kids/checkins/:id/labels')
  @Roles(...KIDS_FAMILY_ROLES, 'volunteer')
  labels(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.labelsService.forCheckin(toKidsActor(user), id);
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

  // O responsável relê o código do filho (ou a gestão). Voluntário não: a
  // equipe vê o código no check-in e, se o responsável esqueceu, usa o override.
  @Get('kids/children/:id/checkin')
  @Roles(...KIDS_FAMILY_ROLES)
  openForChild(@Param('id', ParseUUIDPipe) childId: string, @CurrentUser() user: JwtPayload) {
    return this.checkinService.getOpenForChild(toKidsActor(user), childId);
  }

  @Get('kids/sessions/:id/roster')
  @Roles(...KIDS_READ_ROLES)
  roster(@Param('id', ParseUUIDPipe) sessionId: string, @CurrentUser() user: JwtPayload) {
    return this.rosterService.roster(toKidsActor(user), sessionId);
  }
}
