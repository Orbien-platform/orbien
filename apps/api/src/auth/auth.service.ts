import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { hashToken } from '../common/crypto/token-hash';
import { PrismaService } from '../prisma/prisma.service';
import {
  findLoginByEmail,
  findRefreshTokenByHash,
  findSessionByUserId,
  withRefreshContext,
} from './auth-lookup';
import { findImpersonateTarget } from '../common/public-lookup';
import { MailService } from '../mail/mail.service';
import { PLATFORM_MAIL_BRAND, TENANT_MAIL_BRAND_SELECT, tenantMailBrand } from '../mail/mail-brand';
import {
  LoginRateLimitService,
  LOGIN_POLICY,
  PASSWORD_RESET_POLICY,
} from './login-rate-limit.service';
import { LoginDto } from './dto/login.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ImpersonateDto } from './dto/impersonate.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { adminUrl, frontendUrl } from '../common/urls/frontend-url';

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

/** Papel que dá acesso ao console da plataforma. Global, não por tenant. */
const PLATFORM_ROLE = 'platform_support';

interface RoleAssignmentRow {
  role_code: string;
  // Não-nulável no schema (`RoleAssignment.congregation_id: String`); tipar
  // mais largo só criaria um caso para raciocinar que o banco não produz.
  congregation_id: string;
}

/**
 * Hash argon2id de uma senha aleatória que ninguém conhece, gerado com os
 * parâmetros padrão de `argon2.hash` (os mesmos de toda conta real: m=65536,
 * t=3, p=4). Existe só para o caminho "sem conta" do login gastar o MESMO
 * `argon2.verify` que o caminho "conta existe, senha errada" gasta — sem isso,
 * e-mail inexistente respondia em microssegundos e conta existente em dezenas
 * de milissegundos, e a diferença de tempo entregava quais e-mails têm conta.
 *
 * O resultado desse verify é descartado: quem decide é `!user`. Se o custo do
 * `argon2.hash` padrão mudar, `auth.service.spec.ts` falha (`needsRehash`) até
 * este valor ser regerado.
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$glXfxHATcc3QlcQbiN2qLg$YLQzDZX8N7oMtiDYBQlsPYOZTtntvanY/fhw0vYBguw';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly rateLimit: LoginRateLimitService,
  ) {}

  async login(
    dto: LoginDto,
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    // `user_accounts.email` é único em todo o banco (@@unique([email])), então
    // a janela do limitador é só por e-mail — não há mais tenant a incluir na
    // chave, e não há ambiguidade a resolver: zero ou uma conta, nunca mais.
    const limitKey = LoginRateLimitService.key('login', dto.email);
    await this.rateLimit.assert(limitKey, LOGIN_POLICY);

    const invalid = new UnauthorizedException({
      message: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    });

    // `orbien_app` não lê `user_accounts` direto (PEND-04 D): a leitura vai pela
    // função SECURITY DEFINER de `033_rls_auth_lookup.sql`.
    const user = await findLoginByEmail(this.prisma, dto.email);

    // E-mail inexistente, conta inativa e tenant inativo levam o mesmo 401
    // genérico — quem tenta entrar não deve descobrir por qual desses motivos
    // a tentativa falhou. Quem barra de fato tenant inativo em toda
    // requisição — não só aqui — é o `JwtStrategy.validate`; este é o caminho
    // que evita emitir um token que já nasceria inútil.
    //
    // O `argon2.verify` roda em TODOS os caminhos, antes de qualquer decisão:
    // sem conta, contra `DUMMY_PASSWORD_HASH` (mesmo custo de uma conta real).
    // Senão o tempo de resposta diferenciava e-mail com conta de e-mail sem
    // conta (e conta inativa de ativa). O resultado só vale com a conta
    // aprovada; sem conta, é descartado.
    const valid = await argon2.verify(user?.password_hash ?? DUMMY_PASSWORD_HASH, dto.password);

    if (!user || !user.is_active || !user.tenant_is_active) {
      await this.rateLimit.register(limitKey, LOGIN_POLICY);
      throw invalid;
    }

    if (!valid) {
      await this.rateLimit.register(limitKey, LOGIN_POLICY);
      throw invalid;
    }

    // Credencial certa zera a janela: quem sabe a senha nunca esbarra no limite.
    await this.rateLimit.clear(limitKey);

    const roles = rolesForToken(user.roles, user.congregation_id);

    const plan = (user.plan ?? 'starter') as 'starter' | 'premium';

    const payload: JwtPayload = {
      sub: user.user_id,
      tenant_id: user.tenant_id,
      congregation_id: user.congregation_id,
      roles,
      plan,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refresh_token = await this.createRefreshToken(user.user_id, user.tenant_id);

    return { access_token, refresh_token, expires_in: EXPIRES_IN };
  }

  /**
   * Login do console da plataforma — sem `tenant_slug`.
   *
   * `POST /auth/login` também busca só por e-mail hoje (`user_accounts` é
   * única por `email` em todo o banco), e aqui é igual: zero ou uma conta,
   * nunca mais — o mesmo `findUnique` de `login()`. A única diferença é o
   * desempate por papel: só uma conta com `platform_support` em
   * `role_assignments` pode entrar por esta rota.
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
   * `login`, e a leitura da conta vai pela função `auth_login_lookup` (SECURITY DEFINER).
   */
  async platformLogin(
    dto: PlatformLoginDto,
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const invalid = new UnauthorizedException({
      message: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    });

    // A porta do console é a que mais interessa fechar: daqui se chega a
    // `POST /auth/impersonate`, e de lá a qualquer tenant.
    const limitKey = LoginRateLimitService.key('platform-login', dto.email);
    await this.rateLimit.assert(limitKey, LOGIN_POLICY);

    const user = await findLoginByEmail(this.prisma, dto.email);

    // Sem o papel é indistinguível de e-mail inexistente, e tem que ser: quem
    // tenta entrar aqui com credencial válida de `tenant_admin` não deve
    // descobrir pela mensagem que a credencial serve em outro lugar.
    const hasPlatformRole =
      user?.roles.some((ra) => ra.role_code === PLATFORM_ROLE) ?? false;

    // Mesmo `argon2.verify` em todos os caminhos (ver `login`): sem conta, contra
    // o hash de mesmo custo; sem o papel ou inativa, contra o hash real.
    const valid = await argon2.verify(user?.password_hash ?? DUMMY_PASSWORD_HASH, dto.password);

    if (!user || !user.is_active || !hasPlatformRole) {
      await this.rateLimit.register(limitKey, LOGIN_POLICY);
      throw invalid;
    }

    if (!valid) {
      await this.rateLimit.register(limitKey, LOGIN_POLICY);
      throw invalid;
    }

    await this.rateLimit.clear(limitKey);

    const plan = (user.plan ?? 'starter') as 'starter' | 'premium';

    const payload: JwtPayload = {
      sub: user.user_id,
      tenant_id: user.tenant_id,
      congregation_id: user.congregation_id,
      roles: rolesForToken(user.roles, user.congregation_id),
      plan,
    };

    const access_token = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refresh_token = await this.createRefreshToken(user.user_id, user.tenant_id);

    return { access_token, refresh_token, expires_in: EXPIRES_IN };
  }

  async refresh(
    dto: RefreshDto,
  ): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
    const hash = this.hashToken(dto.refresh_token);

    // Leitura por hash exato (036): `orbien_app` não lê `refresh_tokens` direto.
    const stored = await findRefreshTokenByHash(this.prisma, hash);

    if (!stored) throw new UnauthorizedException('Token inválido');

    // Conta, papéis e tenant vêm da função SECURITY DEFINER (PEND-04 D). A FK
    // com cascade garante a conta; se vier vazia, o token é inválido. Vem antes
    // da detecção de reuso porque toda escrita em `refresh_tokens` precisa do
    // tenant do dono para fixar o contexto (`revokeFamily`).
    const userAccount = await findSessionByUserId(this.prisma, stored.user_account_id);
    if (!userAccount) throw new UnauthorizedException('Token inválido');

    // Token reuse detected: revoke entire family to contain possible theft
    if (stored.revoked_at !== null) {
      await this.revokeFamily(stored.user_account_id, userAccount.tenant_id);
      throw new UnauthorizedException('Sessão encerrada por segurança. Faça login novamente.');
    }

    if (stored.expires_at < new Date()) {
      throw new UnauthorizedException('Sessão expirada');
    }

    // Conta desativada não renova — e a família inteira cai junto. Tenant
    // inativado é o mesmo caso: `JwtStrategy.validate` já barra o acesso em
    // toda requisição autenticada, mas sem este check a cadeia de refresh de
    // um usuário do tenant seguia girando, emitindo access tokens novos para
    // um tenant que não deveria mais autenticar ninguém.
    //
    // Sem isto, `refresh` só olhava hash, `revoked_at` e `expires_at`: desativar
    // uma conta não impedia a ROTAÇÃO, e a cadeia seguia girando indefinidamente,
    // emitindo access tokens novos. Não havia exposição — `JwtStrategy.validate`
    // relê `is_active` em toda requisição autenticada e devolve 401, então o
    // acesso já estava cortado. O que continuava vivo era a cadeia, e é ela que
    // se derruba aqui: refresh token de conta desativada devia ser revogado, não
    // renovado.
    //
    // Derruba a família toda, e não só este token, pela mesma razão da detecção
    // de reuso logo acima: o que se quer é encerrar a sessão, não invalidar um
    // elo e deixar os outros de pé.
    if (!userAccount.is_active || !userAccount.tenant_is_active) {
      await this.revokeFamily(stored.user_account_id, userAccount.tenant_id);
      throw new UnauthorizedException('Sessão encerrada. Faça login novamente.');
    }

    const newRaw = randomBytes(64).toString('hex');
    const newHash = this.hashToken(newRaw);

    // Reivindica o token com um UPDATE condicional (`revoked_at: null` no
    // WHERE), não com o SELECT lá em cima + um UPDATE incondicional. Entre a
    // leitura e este ponto, outra chamada com o mesmo refresh token — duas
    // abas que a trava de `navigator.locks` do web não alcança porque uma é
    // o app mobile, ou duas chamadas de fato simultâneas — pode ter revogado
    // este token primeiro. Sem a condição no WHERE, as duas rotacionariam
    // "com sucesso", bifurcando a família em silêncio e sem o alarme de
    // reuso que existe exatamente para isto. `count` é quem decide quem
    // venceu a corrida.
    const rotated = await withRefreshContext(
      this.prisma,
      { userId: stored.user_account_id, tenantId: userAccount.tenant_id },
      async (tx) => {
      const reivindicado = await tx.refreshToken.updateMany({
        where: { id: stored.id, revoked_at: null },
        data: { revoked_at: new Date() },
      });

      if (reivindicado.count === 0) return null;

      const created = await tx.refreshToken.create({
        data: {
          user_account_id: stored.user_account_id,
          token_hash: newHash,
          expires_at: this.refreshExpiry(),
        },
      });

      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { replaced_by_id: created.id },
      });

      return created;
      },
    );

    if (!rotated) {
      // Perdeu a corrida: trata como o reuso detectado logo no topo deste
      // método — a família inteira cai, sem distinguir "duas chamadas
      // legítimas colidiram" de "alguém reusou um token roubado". É essa
      // ambiguidade que o design de rotação de refresh token já aceitava
      // antes desta mudança (mesma resposta na detecção de reuso lá em
      // cima); o que muda aqui é só que ela agora é DETECTADA — antes, sob
      // corrida de verdade, nenhum dos dois lados via `revoked_at` setado a
      // tempo, e as duas rotações "davam certo" em silêncio, bifurcando a
      // família sem alarme nenhum.
      //
      // Isto revoga a família inteira, o que inclui o token que o lado
      // vencedor acabou de criar (ele nasceu com `revoked_at: null`, então
      // este `updateMany` o alcança também) — quem venceu a reivindicação
      // recebe 200 e grava cookies novos, mas eles já nascem mortos. Não dá
      // para evitar isto sem enfraquecer a detecção de reuso: o único sinal
      // que o lado perdedor tem é "este id já estava revogado", e é
      // exatamente esse sinal que soa alarme quando é theft de verdade —
      // amaciar a resposta aqui teria o mesmo efeito para as duas causas.
      await this.revokeFamily(stored.user_account_id, userAccount.tenant_id);
      throw new UnauthorizedException('Sessão encerrada por segurança. Faça login novamente.');
    }

    const roles = rolesForToken(userAccount.roles, userAccount.congregation_id);

    const plan = (userAccount.plan ?? 'starter') as 'starter' | 'premium';

    const payload: JwtPayload = {
      sub: userAccount.user_id,
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
    // Hash desconhecido não é erro (idempotente, como era). Achado o dono, a
    // revogação roda no contexto dele — `orbien_app` não escreve direto.
    const stored = await findRefreshTokenByHash(this.prisma, hash);
    const owner = stored ? await findSessionByUserId(this.prisma, stored.user_account_id) : null;
    if (stored && owner) {
      await withRefreshContext(
        this.prisma,
        { userId: stored.user_account_id, tenantId: owner.tenant_id },
        (tx) =>
          tx.refreshToken.updateMany({
            where: { token_hash: hash, revoked_at: null },
            data: { revoked_at: new Date() },
          }),
      );
    }
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
    // contexto — o mesmo caminho do `login`: a conta e os
    // papéis vêm de `auth_session_lookup` (SECURITY DEFINER), lidos de
    // `role_assignments` no banco — nunca do `roles` do token.
    const actor = await findSessionByUserId(this.prisma, requestingUser.sub);
    const isPlatform =
      !!actor?.is_active && actor.roles.some((ra) => ra.role_code === PLATFORM_ROLE);
    if (!isPlatform) throw new ForbiddenException();

    // `orbien_app` não lê `tenants`/`tenant_plans`/`congregations` direto
    // (PEND-04 C): o destino vem de `auth_impersonate_target` (034).
    const target = await findImpersonateTarget(this.prisma, dto.target_tenant_id);
    if (!target) throw new NotFoundException('Tenant não encontrado');

    const congregation_id = target.congregation_id;
    if (!congregation_id) throw new NotFoundException('Tenant sem congregações');

    const plan = (target.plan ?? 'starter') as 'starter' | 'premium';

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

  /**
   * Redefinição pedida pelo web ou pelo app. O e-mail sai com a marca da igreja
   * do tenant da conta, e o link abre o `/redefinir-senha` do web.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.issuePasswordReset(dto.email, 'tenant');
  }

  /**
   * Redefinição pedida pelo console — fluxo separado do web, como o login.
   * Só conta com `platform_support` em `role_assignments` recebe o e-mail; o
   * resto recebe a mesma resposta genérica, sem e-mail nenhum, pelo mesmo
   * motivo do 401 de `platformLogin`: quem digita aqui um e-mail de
   * `tenant_admin` não deve descobrir que ele serve em outro lugar. O e-mail
   * sai com a marca da Orbien, e o link abre o `/redefinir-senha` do admin.
   */
  async platformForgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.issuePasswordReset(dto.email, 'platform');
  }

  private async issuePasswordReset(
    email: string,
    scope: 'tenant' | 'platform',
  ): Promise<{ message: string }> {
    const genericResponse = {
      message: 'Se o email estiver cadastrado, você receberá um link de redefinição.',
    };

    // Mesmo limitador das rotas de login, mesma tabela — e não mais um `Map` por
    // processo, que com N instâncias no Render valia 1/N e sumia a cada deploy.
    // A resposta segue genérica: dizer "muitas tentativas" contaria que alguém
    // andou pedindo redefinição para este e-mail. Chave só por e-mail, mesmo
    // princípio de `login()`: `user_accounts.email` é único em todo o banco,
    // não há mais tenant a incluir na chave. Console e web têm chaves
    // separadas, como os dois logins.
    const limitKey = LoginRateLimitService.key(scope === 'platform' ? 'platform-reset' : 'reset', email);
    if (!(await this.rateLimit.check(limitKey, PASSWORD_RESET_POLICY))) {
      return genericResponse;
    }
    await this.rateLimit.register(limitKey, PASSWORD_RESET_POLICY);

    const user = await this.prisma.system.userAccount.findUnique({
      where: { email },
      include: {
        person: { select: { full_name: true } },
        tenant: { select: TENANT_MAIL_BRAND_SELECT },
        roleAssignments: { select: { role_code: true } },
      },
    });
    if (!user || !user.is_active) return genericResponse;
    if (scope === 'platform' && !user.roleAssignments?.some((ra) => ra.role_code === PLATFORM_ROLE)) {
      return genericResponse;
    }

    // Invalidate any existing unused tokens for this user
    await this.prisma.system.passwordResetToken.updateMany({
      where: { user_id: user.id, used_at: null },
      data: { used_at: new Date() },
    });

    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await this.prisma.system.passwordResetToken.create({
      data: { user_id: user.id, token_hash: hashToken(rawToken), expires_at: expiresAt },
    });

    const baseUrl = scope === 'platform' ? adminUrl() : frontendUrl();
    const resetUrl = `${baseUrl}/redefinir-senha?token=${rawToken}`;
    const userName = user.person?.full_name?.split(' ')[0] ?? '';
    const brand = scope === 'platform' ? PLATFORM_MAIL_BRAND : tenantMailBrand(user.tenant);

    await this.mail.sendPasswordReset(user.email, resetUrl, userName, brand);

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const resetToken = await this.prisma.system.passwordResetToken.findUnique({
      where: { token_hash: hashToken(dto.token) },
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

  private async createRefreshToken(userAccountId: string, tenantId: string): Promise<string> {
    const raw = randomBytes(64).toString('hex');
    await withRefreshContext(this.prisma, { userId: userAccountId, tenantId }, (tx) =>
      tx.refreshToken.create({
        data: {
          user_account_id: userAccountId,
          token_hash: this.hashToken(raw),
          expires_at: this.refreshExpiry(),
        },
      }),
    );
    return raw;
  }

  /**
   * Revoga a família inteira do usuário (reuso detectado, conta/tenant inativo,
   * corrida perdida). No contexto do dono, por `own_tokens`.
   */
  private async revokeFamily(userAccountId: string, tenantId: string): Promise<void> {
    await withRefreshContext(this.prisma, { userId: userAccountId, tenantId }, (tx) =>
      tx.refreshToken.updateMany({
        where: { user_account_id: userAccountId, revoked_at: null },
        data: { revoked_at: new Date() },
      }),
    );
  }

  // SHA-256 (helper compartilhado com o token de redefinição): ver common/crypto/token-hash.ts.
  private hashToken(token: string): string {
    return hashToken(token);
  }

  private refreshExpiry(): Date {
    const d = new Date();
    d.setDate(d.getDate() + REFRESH_TOKEN_TTL_DAYS);
    return d;
  }
}
