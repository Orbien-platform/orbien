import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PlanGuard } from '../../auth/guards/plan.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequiresPlan } from '../../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { toKidsActor } from '../children/kids-child-access.service';
import { KIDS_FAMILY_ROLES } from '../kids.roles';
import { KidsConsentService } from './kids-consent.service';
import { KidsConsentStatusQueryDto, RegisterKidsConsentDto, RevokeKidsConsentDto } from './dto/kids-consent.dto';

@Controller('kids/consent')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
@Roles(...KIDS_FAMILY_ROLES)
export class KidsConsentController {
  constructor(private readonly consentService: KidsConsentService) {}

  @Get()
  status(@Query() query: KidsConsentStatusQueryDto, @CurrentUser() user: JwtPayload) {
    return this.consentService.status(toKidsActor(user), query.guardian_person_id);
  }

  @Post()
  register(@Body() dto: RegisterKidsConsentDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.consentService.register(toKidsActor(user), dto, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }

  // Revogar bloqueia novos check-ins e mantém o histórico (AC 6).
  @Post('revoke')
  @HttpCode(200)
  revoke(@Body() dto: RevokeKidsConsentDto, @CurrentUser() user: JwtPayload) {
    return this.consentService.revokeFor(toKidsActor(user), dto);
  }
}
