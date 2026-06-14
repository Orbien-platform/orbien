import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 7;
const EXPIRES_IN = 900;
const RESET_TOKEN_TTL_MINUTES = 30;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // key: email — value: { count, resetAt }
  private readonly resetRateLimit = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async login(
    dto: LoginDto,
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenant_slug },
      include: { tenantPlan: { select: { plan: true } } },
    });
    if (!tenant) throw new UnauthorizedException('Credenciais inválidas');

    const user = await this.prisma.userAccount.findUnique({
      where: { tenant_id_email: { tenant_id: tenant.id, email: dto.email } },
      include: {
        roleAssignments: { select: { role_code: true, congregation_id: true } },
      },
    });

    if (!user || !user.is_active) throw new UnauthorizedException('Credenciais inválidas');

    const valid = await argon2.verify(user.password_hash, dto.password);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    const roles = user.roleAssignments
      .filter((ra) => ra.congregation_id === user.congregation_id)
      .map((ra) => ra.role_code);

    const plan = (tenant.tenantPlan?.plan ?? 'starter') as 'starter' | 'premium';

    const payload: JwtPayload = {
      sub: user.id,
      tenant_id: tenant.id,
      congregation_id: user.congregation_id,
      roles,
      plan,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refresh_token = await this.createRefreshToken(user.id);

    return { access_token, refresh_token, expires_in: EXPIRES_IN };
  }

  async refresh(
    dto: RefreshDto,
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const hash = this.hashToken(dto.refresh_token);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { token_hash: hash },
      include: {
        userAccount: {
          include: {
            roleAssignments: { select: { role_code: true, congregation_id: true } },
            tenant: { include: { tenantPlan: { select: { plan: true } } } },
          },
        },
      },
    });

    if (!stored) throw new UnauthorizedException('Token inválido');

    // Token reuse detected: revoke entire family to contain possible theft
    if (stored.revoked_at !== null) {
      await this.prisma.refreshToken.updateMany({
        where: { user_account_id: stored.user_account_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      throw new UnauthorizedException('Sessão encerrada por segurança. Faça login novamente.');
    }

    if (stored.expires_at < new Date()) {
      throw new UnauthorizedException('Sessão expirada');
    }

    const newRaw = randomBytes(64).toString('hex');
    const newHash = this.hashToken(newRaw);

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({
        data: {
          user_account_id: stored.user_account_id,
          token_hash: newHash,
          expires_at: this.refreshExpiry(),
        },
      });

      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revoked_at: new Date(), replaced_by_id: created.id },
      });
    });

    const { userAccount } = stored;
    const roles = userAccount.roleAssignments
      .filter((ra) => ra.congregation_id === userAccount.congregation_id)
      .map((ra) => ra.role_code);

    const plan = (userAccount.tenant.tenantPlan?.plan ?? 'starter') as 'starter' | 'premium';

    const payload: JwtPayload = {
      sub: userAccount.id,
      tenant_id: userAccount.tenant_id,
      congregation_id: userAccount.congregation_id,
      roles,
      plan,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    return { access_token, refresh_token: newRaw, expires_in: EXPIRES_IN };
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    const hash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { token_hash: hash, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return { message: 'Sessão encerrada.' };
  }

  async impersonate(
    requestingUser: JwtPayload,
    dto: ImpersonateDto,
  ): Promise<{ access_token: string; expires_in: number }> {
    if (!requestingUser.roles.includes('platform_support')) {
      throw new ForbiddenException();
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.target_tenant_id },
      include: {
        tenantPlan: { select: { plan: true } },
        congregations: { take: 1, select: { id: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const congregation_id = tenant.congregations[0]?.id;
    if (!congregation_id) throw new NotFoundException('Tenant sem congregações');

    const plan = (tenant.tenantPlan?.plan ?? 'starter') as 'starter' | 'premium';

    const payload: JwtPayload = {
      sub: requestingUser.sub,
      tenant_id: dto.target_tenant_id,
      congregation_id,
      roles: requestingUser.roles,
      plan,
      support_session: true,
      impersonated_by: requestingUser.sub,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    return { access_token, expires_in: EXPIRES_IN };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const genericResponse = {
      message: 'Se o email estiver cadastrado, você receberá um link de redefinição.',
    };

    if (!this.checkResetRateLimit(dto.email)) {
      // Return generic response to avoid leaking rate limit info
      return genericResponse;
    }

    const tenant = await this.prisma.system.tenant.findUnique({
      where: { slug: dto.tenant_slug },
    });
    if (!tenant) return genericResponse;

    const user = await this.prisma.system.userAccount.findUnique({
      where: { tenant_id_email: { tenant_id: tenant.id, email: dto.email } },
      include: { person: { select: { full_name: true } } },
    });
    if (!user || !user.is_active) return genericResponse;

    // Invalidate any existing unused tokens for this user
    await this.prisma.system.passwordResetToken.updateMany({
      where: { user_id: user.id, used_at: null },
      data: { used_at: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await this.prisma.system.passwordResetToken.create({
      data: { user_id: user.id, token: rawToken, expires_at: expiresAt },
    });

    const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3001';
    const resetUrl = `${frontendUrl}/redefinir-senha?token=${rawToken}`;
    const userName = user.person?.full_name?.split(' ')[0] ?? '';

    try {
      await this.mail.sendPasswordReset(user.email, resetUrl, userName);
    } catch (err) {
      this.logger.error('Failed to send password reset email', err);
    }

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const resetToken = await this.prisma.system.passwordResetToken.findUnique({
      where: { token: dto.token },
    });

    if (!resetToken || resetToken.used_at !== null || resetToken.expires_at < new Date()) {
      throw new BadRequestException('Link inválido ou expirado.');
    }

    const newHash = await argon2.hash(dto.password);

    await this.prisma.system.$transaction(async (tx) => {
      await tx.userAccount.update({
        where: { id: resetToken.user_id },
        data: { password_hash: newHash },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used_at: new Date() },
      });

      // Force logout from all sessions
      await tx.refreshToken.updateMany({
        where: { user_account_id: resetToken.user_id, revoked_at: null },
        data: { revoked_at: new Date() },
      });
    });

    return { message: 'Senha redefinida com sucesso.' };
  }

  private checkResetRateLimit(email: string): boolean {
    const now = Date.now();
    const entry = this.resetRateLimit.get(email);

    if (!entry || now > entry.resetAt) {
      this.resetRateLimit.set(email, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return true;
    }

    if (entry.count >= RATE_LIMIT_MAX) return false;

    entry.count++;
    return true;
  }

  private async createRefreshToken(userAccountId: string): Promise<string> {
    const raw = randomBytes(64).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        user_account_id: userAccountId,
        token_hash: this.hashToken(raw),
        expires_at: this.refreshExpiry(),
      },
    });
    return raw;
  }

  // SHA-256 for deterministic O(1) DB lookup.
  // Argon2 is not viable here: its random salt makes lookup impossible without a full-scan + verify.
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiry(): Date {
    const d = new Date();
    d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
    return d;
  }
}
