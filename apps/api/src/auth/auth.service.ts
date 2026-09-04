import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DAYS = 7;
const EXPIRES_IN = 900;
// Sessão de suporte: bem mais curto que o token normal, de propósito. Não tem
// refresh — a única forma de renovar é chamar /auth/impersonate de novo, o que
// exige o papel válido no banco naquele instante. Um TTL igual ao do token
// comum deixaria uma janela de 15 minutos em que o papel já pode ter sido
// revogado e a sessão de suporte continuaria valendo.
const IMPERSONATE_TOKEN_TTL = '5m';
const IMPERSONATE_EXPIRES_IN = 300;
const RESET_TOKEN_TTL_MINUTES = 30;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Papel que dá acesso ao console da plataforma. Global, não por tenant. */
const PLATFORM_ROLE = 'platform_support';

interface RoleAssignmentRow {
  role_code: string;
  // Não-nulável no schema (`RoleAssignment.congregation_id: String`); tipar
  // mais largo só criaria um caso para raciocinar que o banco não produz.
  congregation_id: string;
}

/**
 * Papéis que vão para o token.
 *
 * A regra base é a de sempre: só os papéis atribuídos na congregação em que a
 * conta está. `platform_support` é a exceção, e por natureza — ele é global
 * (ver `app_is_platform_support()` em 004, que não filtra por tenant nem por
 * congregação). Sem a exceção, uma atribuição feita em outra congregação do
 * mesmo tenant sumiria do token na primeira renovação, e o console derrubaria
 * a sessão a cada 15 minutos sem motivo aparente.
 *
 * Nas duas rotas de plataforma isto não amplia nada: elas têm `@PlatformRoute()`
 * e quem decide no banco é `app_is_platform_support()`, que lê
 * `role_assignments` e já não filtra por congregação — o token só passou a
 * concordar com o banco.
 *
 * `POST /auth/impersonate` levava `@Roles('platform_support')` e decidia pelo
 * token, então esta união ampliaria quem chega à rota mais poderosa do sistema.
 * Não amplia mais: ela passou a resolver o papel em `role_assignments` (ver
 * `impersonate`), e o `roles` do JWT deixou de ser autoridade ali.
 *
 * `POST /internal/celebrations/*` também leva `@Roles('platform_support')` e
 * segue decidindo pelo token; é job interno e não devolve dado de igreja.
 */
function rolesForToken(
  assignments: RoleAssignmentRow[],
  congregationId: string,
): string[] {
  const roles = new Set(
    assignments.filter((ra) => ra.congregation_id === congregationId).map((ra) => ra.role_code),
  );
  if (assignments.some((ra) => ra.role_code === PLATFORM_ROLE)) roles.add(PLATFORM_ROLE);
  return [...roles];
}

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
    if (!tenant)
      throw new UnauthorizedException({ message: 'Tenant not found', code: 'TENANT_NOT_FOUND' });

    const user = await this.prisma.userAccount.findUnique({
      where: { tenant_id_email: { tenant_id: tenant.id, email: dto.email } },
      include: {
        roleAssignments: { select: { role_code: true, congregation_id: true } },
      },
    });

    if (!user || !user.is_active)
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });

    const valid = await argon2.verify(user.password_hash, dto.password);
    if (!valid)
      throw new UnauthorizedException({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });

    const roles = rolesForToken(user.roleAssignments, user.congregation_id);

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

  /**
   * Login do console da plataforma — sem `tenant_slug`.
   *
   * `POST /auth/login` pede o slug porque `user_accounts` é única por
   * `(tenant_id, email)`: sem o tenant não há chave para procurar a conta. Aqui
   * o desempate vem de outro lugar — o papel. Só contas que têm
   * `platform_support` em `role_assignments` são candidatas, e são poucas,
   * porque o papel é da equipe que administra o ecossistema.
   *
   * O token continua carregando o tenant e a congregação de origem da conta,
   * resolvidos aqui e não informados pelo cliente. Não é detalhe: as rotas de
   * plataforma ignoram esse tenant (o `@PlatformRoute()` não o fixa no
   * contexto, e é a ausência dele que abre o ramo `app_platform_access()`), mas
   * o `AuditInterceptor` o usa como `audit_logs.tenant_id` — coluna NOT NULL
   * com FK para `tenants`. Emitir token sem tenant faria toda linha
   * `platform_access` falhar no INSERT, e a auditoria é best-effort: ela cairia
   * em silêncio, deixando o plano de plataforma sem rastro. Foi exatamente o
   * defeito da pendência nº 6.
   *
   * Roda antes de haver contexto, como `orbien_app` — o mesmo caminho do
   * `login`, e o que o sustenta são as policies `orbien_app_auth`.
   */
  async platformLogin(
    dto: PlatformLoginDto,
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const invalid = new UnauthorizedException({
      message: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    });

    // Busca por e-mail sem tenant não usa a unique `(tenant_id, email)` — é
    // varredura. Aceitável e deliberado: o `where` do papel corta para as
    // poucas contas de plataforma, e este login é de um punhado de pessoas.
    const candidates = await this.prisma.userAccount.findMany({
      where: {
        email: dto.email,
        is_active: true,
        roleAssignments: { some: { role_code: PLATFORM_ROLE } },
      },
      include: {
        roleAssignments: { select: { role_code: true, congregation_id: true } },
        tenant: { include: { tenantPlan: { select: { plan: true } } } },
      },
    });

    // Uma conta sem o papel é indistinguível de e-mail inexistente, e tem que
    // ser: quem tenta entrar aqui com credencial válida de `tenant_admin` não
    // deve descobrir pela mensagem que a credencial serve em outro lugar.
    const matches = [];
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.password_hash, dto.password)) {
        matches.push(candidate);
      }
    }

    if (matches.length === 0) throw invalid;

    // O mesmo e-mail pode existir em dois tenants — a unique é por par. Se os
    // dois tiverem `platform_support` e a mesma senha, não há como saber qual
    // conta o token deveria representar, e escolher uma em silêncio poria o
    // tenant errado em `audit_logs`. Falha alto: é erro de configuração.
    if (matches.length > 1) {
      throw new ConflictException({
        message:
          'Este e-mail tem acesso de plataforma em mais de um tenant. ' +
          'Deixe o papel platform_support em apenas uma das contas.',
        code: 'PLATFORM_ACCOUNT_AMBIGUOUS',
      });
    }

    const user = matches[0]!;
    const plan = (user.tenant.tenantPlan?.plan ?? 'starter') as 'starter' | 'premium';

    const payload: JwtPayload = {
      sub: user.id,
      tenant_id: user.tenant_id,
      congregation_id: user.congregation_id,
      roles: rolesForToken(user.roleAssignments, user.congregation_id),
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
    const roles = rolesForToken(userAccount.roleAssignments, userAccount.congregation_id);

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
    // O papel vem do BANCO, não do token — mesmo princípio que o cabeçalho de
    // `004_rls_platform_plane.sql` declara para `app_is_platform_support()`:
    // "o predicado que abre TODOS os tenants é o último lugar do sistema onde
    // vale a pena depender de um valor que veio de fora do banco". Esta rota
    // abre UM tenant por inteiro e emite `support_session: true`, marca que
    // satisfaz qualquer `@Roles` no `RolesGuard`. É a mesma classe de decisão,
    // e estava decidindo pelo token.
    //
    // O que isto de fato acrescenta é uma coisa só, e é a que importa: papel
    // revogado passa a valer na hora. Antes, o `roles` do JWT continuava
    // dizendo `platform_support` por até 15 minutos, e a cadeia de refresh
    // seguia renovando. De passagem, a união de `rolesForToken()` deixa de
    // ampliar quem chega aqui, porque o token não é mais autoridade.
    //
    // O `is_active` é redundância deliberada: `JwtStrategy.validate` já
    // confere isso em toda requisição autenticada, então conta desativada leva
    // 401 antes de chegar aqui. Fica porque o serviço não deve depender de o
    // guard estar montado — mas não conte como ganho desta consulta.
    //
    // O `@Roles('platform_support')` do controller fica: é rejeição barata
    // antes da consulta. Autoridade é esta linha. Roda como `orbien_app`, sem
    // contexto — o mesmo caminho do `login`, sustentado pelas policies
    // `orbien_app_auth`.
    const actor = await this.prisma.userAccount.findFirst({
      where: {
        id: requestingUser.sub,
        is_active: true,
        roleAssignments: { some: { role_code: PLATFORM_ROLE } },
      },
      select: { id: true },
    });
    if (!actor) throw new ForbiddenException();

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

    const access_token = this.jwtService.sign(payload, { expiresIn: IMPERSONATE_TOKEN_TTL });
    return { access_token, expires_in: IMPERSONATE_EXPIRES_IN };
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

    await this.mail.sendPasswordReset(user.email, resetUrl, userName);

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
