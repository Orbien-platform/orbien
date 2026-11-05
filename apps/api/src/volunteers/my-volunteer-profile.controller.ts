import { Body, Controller, Get, HttpCode, Patch, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { VolunteerProfilesService } from './volunteer-profiles.service';
import { AcceptVolunteerTermDto, UpdateMyVolunteerProfileDto } from './dto/update-my-volunteer-profile.dto';

/** Mesmos papéis de `volunteers/unavailability`: quem serve lê o próprio perfil. */
const VOLUNTEER_ROLES = [
  'volunteer',
  'member',
  'ministry_leader',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];

@Controller('volunteers/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class MyVolunteerProfileController {
  constructor(private readonly profilesService: VolunteerProfilesService) {}

  @Get('profile')
  @Roles(...VOLUNTEER_ROLES)
  findMine(@CurrentUser() user: JwtPayload) {
    return this.profilesService.findMine(user.sub, user.tenant_id, user.congregation_id);
  }

  /** Só `availability`: habilidade e restrições continuam da liderança. */
  @Patch('profile')
  @Roles(...VOLUNTEER_ROLES)
  updateMine(@Body() dto: UpdateMyVolunteerProfileDto, @CurrentUser() user: JwtPayload) {
    return this.profilesService.updateMine(user, dto);
  }

  @Post('term')
  @HttpCode(200)
  @Roles(...VOLUNTEER_ROLES)
  acceptTerm(@Body() dto: AcceptVolunteerTermDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.profilesService.acceptTerm(user, dto.term_version, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
  }
}
