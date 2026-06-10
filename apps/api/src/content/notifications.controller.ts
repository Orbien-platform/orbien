import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';

@Controller('content/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('send')
  @Roles('admin_congregation', 'pastor', 'tenant_admin')
  async send(@Body() dto: SendNotificationDto, @CurrentUser() user: JwtPayload) {
    await this.notificationsService.sendManualNotification(
      user.tenant_id,
      user.congregation_id,
      dto,
    );
    return { ok: true };
  }

  @Get(':id/metrics')
  @Roles('admin_congregation', 'pastor', 'tenant_admin')
  async metrics(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.getMetrics(user.tenant_id, user.congregation_id, id);
  }
}
