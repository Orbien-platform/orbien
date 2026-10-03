import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { DonorPixSubscriptionsService } from './donor-pix-subscriptions.service';
import { CreateMyPixSubscriptionDto } from './dto/create-my-pix-subscription.dto';

/**
 * Dízimo automático do próprio doador (PROD-28). Sem `@Roles`, como
 * `/me/permissions` e `/me/notification-preferences`: a rota só opera sobre a
 * pessoa da conta do token, e qualquer papel (o `member` principalmente) é
 * dono da própria assinatura. Sem `@RequiresPlan` também — o `PlanGuard` lê a
 * claim, e aqui o plano é lido do banco, no serviço. Criar está atrás da
 * trava `ASAAS_PAYMENTS_ENABLED`; listar e cancelar, não.
 */
@Controller('me/pix-subscriptions')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@UseInterceptors(TenantContextInterceptor)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class MePixSubscriptionsController {
  constructor(private readonly donorPixSubscriptions: DonorPixSubscriptionsService) {}

  @Post()
  create(@Body() dto: CreateMyPixSubscriptionDto, @CurrentUser() user: JwtPayload) {
    return this.donorPixSubscriptions.create(dto, user);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.donorPixSubscriptions.list(user);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.donorPixSubscriptions.cancel(id, user);
  }
}
