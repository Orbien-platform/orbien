import { Body, Controller, Get, Patch, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

// Sem @Roles de propósito: dado da própria conta sobre si mesma, não uma
// operação administrativa — todo usuário autenticado decide sobre a própria
// caixa de entrada (spec.md, Assumptions). Ver o ajuste correspondente na
// allowlist de src/auth/roles-invariant.spec.ts.
@Controller('me/notification-preferences')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class NotificationPreferencesController {
  constructor(private readonly notificationPreferencesService: NotificationPreferencesService) {}

  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.notificationPreferencesService.get(user.sub);
  }

  @Patch()
  update(@Body() dto: UpdateNotificationPreferencesDto, @CurrentUser() user: JwtPayload) {
    return this.notificationPreferencesService.update(
      user.sub,
      user.tenant_id,
      user.congregation_id,
      dto,
    );
  }
}
