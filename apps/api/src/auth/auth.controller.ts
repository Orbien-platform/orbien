import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Público — sem guard de papel. O ThrottlerGuard aqui é o recorte por IP que
  // o LoginRateLimitService não cobre: aquele é por e-mail, então quem varre
  // muitos e-mails diferentes da mesma origem não esbarrava em nada. O limite é
  // por conexão (rastreado por req.ip, que exige `trust proxy` — ver main.ts),
  // não por identificador — os dois se complementam, nenhum substitui o outro.
  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Público — sem guard de papel. Sem tenant_slug: só contas com
  // platform_support entram, e o tenant de origem é resolvido no serviço. Ver
  // AuthService.platformLogin. Limite por IP mais apertado que o login comum —
  // é a porta que leva ao console da plataforma.
  @Post('platform/login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  @HttpCode(HttpStatus.OK)
  platformLogin(@Body() dto: PlatformLoginDto) {
    return this.authService.platformLogin(dto);
  }

  // Public — no guard
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  // Requires valid JWT; revokes the supplied refresh token
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refresh_token);
  }

  // Público — sem guard de papel. Mesmo recorte por IP das rotas de login,
  // acima do limite por e-mail que o serviço já aplica.
  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // Public — no guard
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // Requires valid JWT + platform_support role
  @Post('impersonate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('platform_support')
  impersonate(@CurrentUser() user: JwtPayload, @Body() dto: ImpersonateDto) {
    return this.authService.impersonate(user, dto);
  }
}
