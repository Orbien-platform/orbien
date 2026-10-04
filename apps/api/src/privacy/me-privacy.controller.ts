import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
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
import { MePrivacyService } from './me-privacy.service';
import { UpdateMyDataDto } from './dto/update-my-data.dto';
import { RevokeConsentDto } from './dto/revoke-consent.dto';

/**
 * Direitos do titular (LGPD, Art. 18 — `CONF-03`). Sem `@Roles`, como as
 * outras rotas `/me/*`: operam só sobre a pessoa da conta do token, resolvida
 * no banco pelo serviço, e qualquer papel — o `member` principalmente — é
 * titular dos próprios dados. Está na allowlist de `roles-invariant.spec.ts`.
 */
@Controller('me')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
@UseInterceptors(TenantContextInterceptor)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class MePrivacyController {
  constructor(private readonly privacy: MePrivacyService) {}

  @Get('personal-data')
  personalData(@CurrentUser() user: JwtPayload) {
    return this.privacy.personalData(user);
  }

  // Gerar o documento inteiro é a operação mais cara daqui: limite menor.
  @Get('export')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Header('Content-Disposition', 'attachment; filename="meus-dados.json"')
  exportData(@CurrentUser() user: JwtPayload) {
    return this.privacy.exportData(user);
  }

  @Patch()
  update(@Body() dto: UpdateMyDataDto, @CurrentUser() user: JwtPayload) {
    return this.privacy.updateMyData(dto, user);
  }

  @Post('revoke-consent')
  @HttpCode(HttpStatus.OK)
  revokeConsent(@Body() dto: RevokeConsentDto, @CurrentUser() user: JwtPayload) {
    return this.privacy.revokeConsent(dto.version, user);
  }

  @Post('deletion-request')
  @HttpCode(HttpStatus.OK)
  requestDeletion(@CurrentUser() user: JwtPayload) {
    return this.privacy.requestDeletion(user);
  }

  @Delete('deletion-request')
  cancelDeletion(@CurrentUser() user: JwtPayload) {
    return this.privacy.cancelDeletion(user);
  }
}
