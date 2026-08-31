import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PixService } from './pix.service';
import { CreatePixDto, CreateDynamicPixDto } from './dto/create-pix.dto';

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

  // ── Cenário 2: PIX dinâmico com QR — AUTENTICADO ──────────────────────────

  @Post('dynamic')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(TenantContextInterceptor)
  @Roles('admin_congregation', 'treasurer', 'tenant_admin')
  createDynamic(@Body() dto: CreateDynamicPixDto, @CurrentUser() user: JwtPayload) {
    return this.pixService.createDynamic(dto, user);
  }

  // ── Cenário 3: Doação pública — PÚBLICO ──────────────────────────────────

  @Post('public-donation')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  createPublicDonation(@Body() dto: CreatePixDto) {
    return this.pixService.createPublicDonation(dto);
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
