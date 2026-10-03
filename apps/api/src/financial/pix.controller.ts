import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PublicDonationThrottlerGuard } from '../common/guards/public-donation-throttler.guard';
import { PixService } from './pix.service';
import { CreatePixDto, CreateDynamicPixDto } from './dto/create-pix.dto';
import { CreatePixSubscriptionDto } from './dto/create-pix-subscription.dto';
import { CreatePublicDonationDto } from './dto/create-public-donation.dto';

const FINANCIAL_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];

@Controller('financial/pix')
export class PixController {
  constructor(private readonly pixService: PixService) {}

  // ── Cenário 1: PIX manual — PÚBLICO ──────────────────────────────────────

  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  createManual(@Body() dto: CreatePixDto) {
    return this.pixService.createManual(dto);
  }

  // ── Cenário 2: PIX dinâmico com QR — AUTENTICADO, Premium (§5.2) ──────────

  @Post('dynamic')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
  @UseInterceptors(TenantContextInterceptor)
  @Roles(...FINANCIAL_ROLES)
  @RequiresPlan('premium')
  createDynamic(@Body() dto: CreateDynamicPixDto, @CurrentUser() user: JwtPayload) {
    return this.pixService.createDynamic(dto, user);
  }

  // ── PIX recorrente — dízimo automático via Asaas — AUTENTICADO, Premium ──
  // (PROD-27, mesmo corte de papel e plano do cenário 2)

  @Post('subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
  @UseInterceptors(TenantContextInterceptor)
  @Roles(...FINANCIAL_ROLES)
  @RequiresPlan('premium')
  createSubscription(@Body() dto: CreatePixSubscriptionDto, @CurrentUser() user: JwtPayload) {
    return this.pixService.createSubscription(dto, user);
  }

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
  @UseInterceptors(TenantContextInterceptor)
  @Roles(...FINANCIAL_ROLES)
  @RequiresPlan('premium')
  listSubscriptions(@CurrentUser() user: JwtPayload) {
    return this.pixService.listSubscriptions(user);
  }

  @Patch('subscriptions/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
  @UseInterceptors(TenantContextInterceptor)
  @Roles(...FINANCIAL_ROLES)
  @RequiresPlan('premium')
  cancelSubscription(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.pixService.cancelSubscription(id, user);
  }

  // ── Cenário 3: Doação pública — PÚBLICO ──────────────────────────────────

  // Balde por igreja + origem (ver `PublicDonationThrottlerGuard`): 30/min. Cada
  // tentativa Premium faz chamadas à Asaas; o teto por tenant no banco é o que
  // segura abuso de verdade.
  @Post('public-donation')
  @UseGuards(PublicDonationThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  createPublicDonation(@Body() dto: CreatePublicDonationDto) {
    return this.pixService.createPublicDonation(dto);
  }

  // Polling da página pública: sem login, só `status` + `expires_at`. O limite
  // é bem mais folgado que o da criação — cada doador esperando consulta a cada
  // poucos segundos, e a leitura é uma linha indexada.
  @Get('public-donation/:tenant_slug/:payment_id')
  @UseGuards(PublicDonationThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  getPublicDonationStatus(
    @Param('tenant_slug') tenantSlug: string,
    @Param('payment_id', ParseUUIDPipe) paymentId: string,
  ) {
    return this.pixService.getPublicDonationStatus(tenantSlug, paymentId);
  }

  // ── Webhook Asaas — PÚBLICO (valida token no header) ─────────────────────

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('asaas-access-token') token: string | undefined,
  ) {
    return this.pixService.handleWebhook(payload, token);
  }
}
