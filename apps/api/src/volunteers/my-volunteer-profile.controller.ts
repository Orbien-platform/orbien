import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { VolunteerProfilesService } from './volunteer-profiles.service';

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
}
