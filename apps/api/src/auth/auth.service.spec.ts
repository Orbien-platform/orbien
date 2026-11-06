/**
 * `auth.service.ts` é a maior superfície de segurança sem teste do projeto:
 * login, refresh (com detecção de reuso), reset de senha e impersonate. O
 * foco aqui não é só "cobre a linha", é travar o comportamento que, se
 * quebrar, vaza sessão ou credencial:
 *
 *   - refresh de um token já revogado derruba a família inteira (reuso é
 *     sinal de token roubado), e conta desativada também não renova;
 *   - forgotPassword nunca revela se o email existe — mesma resposta em
 *     todos os caminhos de "não encontrado";
 *   - impersonate só sai para `platform_support` e sempre carrega
 *     `support_session: true` — é essa marca que o RolesGuard e o
 *     AuditInterceptor leem.
 */

import { ForbiddenException, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService, DUMMY_PASSWORD_HASH } from './auth.service';
import { LoginRateLimitService, LOGIN_POLICY } from './login-rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import {
  findLoginByEmail,
  findRefreshTokenByHash,
  findSessionByUserId,
  withRefreshContext,
} from './auth-lookup';
import { findImpersonateTarget } from '../common/public-lookup';

// PEND-04 D: `orbien_app` não lê `user_accounts` direto; login, refresh e
// impersonate passam pelas funções SECURITY DEFINER de `auth-lookup.ts`. O SQL
// delas é coberto em `test/rls/auth-tables.spec.ts` — aqui o que importa é o
// que o serviço faz com a resposta.
jest.mock('./auth-lookup');
jest.mock('../common/public-lookup');

// `argon2.verify` continua real; o wrapper só registra as chamadas, para provar
// que o verify roda em todos os caminhos do login (equalização de tempo).
jest.mock('argon2', () => {
  const actual = jest.requireActual('argon2');
  return { ...actual, verify: jest.fn(actual.verify) };
});

interface LegacyAccount {
  id?: string;
  tenant_id?: string;
  congregation_id?: string;
  is_active?: boolean;
  password_hash?: string;
  roleAssignments?: Array<{ role_code: string; congregation_id: string | null }>;
  tenant?: { is_active?: boolean; tenantPlan?: { plan: string } | null } | null;
}

/** Forma antiga da conta (relações do Prisma) → linha das funções. */
function adapt(a: LegacyAccount) {
  return {
    user_id: a.id,
    tenant_id: a.tenant_id,
    congregation_id: a.congregation_id,
    password_hash: a.password_hash,
    is_active: a.is_active,
    tenant_is_active: a.tenant?.is_active ?? true,
    plan: a.tenant?.tenantPlan?.plan ?? null,
    roles: a.roleAssignments ?? [],
  };
}

function mockLogin(account: LegacyAccount | null): void {
  (findLoginByEmail as jest.Mock).mockResolvedValue(account ? adapt(account) : null);
}

/** `refresh_tokens` sem `include`; a conta vem de `auth_session_lookup`. */
function mockStored(
  prisma: PrismaService,
  stored: (Record<string, unknown> & { userAccount?: LegacyAccount }) | null,
): void {
  if (!stored) {
    (findRefreshTokenByHash as jest.Mock).mockResolvedValue(null);
    return;
  }
  const { userAccount, ...token } = stored;
  (findRefreshTokenByHash as jest.Mock).mockResolvedValue(token);
  (findSessionByUserId as jest.Mock).mockResolvedValue(userAccount ? adapt(userAccount) : null);
}

beforeEach(() => {
  (argon2.verify as jest.Mock).mockClear();
  (findLoginByEmail as jest.Mock).mockReset();
  (findSessionByUserId as jest.Mock).mockReset();
  (findRefreshTokenByHash as jest.Mock).mockReset();
  // `withRefreshContext` (SET LOCAL ROLE app_user + app.user_id/tenant_id) é
  // coberto no banco real; aqui só importa quem chama e com qual contexto, e o
  // `tx` é o próprio mock do Prisma.
  (withRefreshContext as jest.Mock).mockReset();
  (withRefreshContext as jest.Mock).mockImplementation(
    (client: unknown, _ctx: unknown, fn: (tx: unknown) => unknown) => fn(client),
  );
});

const jwtService = { sign: jest.fn().mockReturnValue('signed-token') } as unknown as JwtService;
const configService = {} as unknown as ConfigService;

function mailMock() {
  return { sendPasswordReset: jest.fn().mockResolvedValue(undefined) } as unknown as MailService;
}

/**
 * Fake de `login_attempts` com o mesmo contrato que o serviço usa.
 *
 * A tabela substituiu o `Map` em memória do limitador; aqui ela volta a ser um
 * `Map`, mas de propósito e do lado do teste — o que importa é que a contagem
 * sobreviva de uma chamada para a outra, que é o que um `mockResolvedValue`
 * fixo não faz.
 */
interface AttemptRow {
  identifier: string;
  count: number;
  window_at: Date;
  blocked_at: Date | null;
}

function attemptStore() {
  const rows = new Map<string, AttemptRow>();
  return {
    rows,
    findUnique: jest.fn(async ({ where }: { where: { identifier: string } }) =>
      rows.get(where.identifier) ?? null,
    ),
    upsert: jest.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: { identifier: string };
        create: AttemptRow;
        update: Partial<AttemptRow>;
      }) => {
        const existing = rows.get(where.identifier);
        rows.set(where.identifier, existing ? { ...existing, ...update } : { ...create });
      },
    ),
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { identifier: string };
        data: Partial<AttemptRow>;
      }) => {
        const existing = rows.get(where.identifier);
        if (existing) rows.set(where.identifier, { ...existing, ...data });
      },
    ),
    delete: jest.fn(async ({ where }: { where: { identifier: string } }) => {
      rows.delete(where.identifier);
    }),
    deleteMany: jest.fn(async ({ where }: { where: { identifier: string } }) => {
      rows.delete(where.identifier);
    }),
  };
}

function serviceWith(prismaOverrides: Record<string, unknown>, mail = mailMock()) {
  const prisma = {
    tenant: { findUnique: jest.fn() },
    userAccount: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      // Default "ganhou a corrida" — os testes de rotação bem-sucedida não
      // mockam isto explicitamente; o que testa o caminho de perda é
      // `AuthService.refresh` mais abaixo, sobrescrevendo por chamada.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    system: {
      tenant: { findUnique: jest.fn() },
      userAccount: { findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
      // A janela do limitador vive aqui — ver `login-rate-limit.service.ts`.
      // Fake com estado em vez de `mockResolvedValue`: o limitador só significa
      // alguma coisa se a contagem persistir entre chamadas.
      loginAttempt: attemptStore(),
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma.system)),
    },
    ...prismaOverrides,
  } as unknown as PrismaService;

  jwtService.sign = jest.fn().mockReturnValue('signed-token');
  const rateLimit = new LoginRateLimitService(prisma);
  const service = new AuthService(prisma, jwtService, configService, mail, rateLimit);
  return { service, prisma, mail, rateLimit };
}

describe('AuthService.login', () => {
  it('rejeita quando a conta não existe (busca só por e-mail, sem tenant_slug)', async () => {
    const { service, prisma } = serviceWith({});
    mockLogin(null);

    await expect(
      service.login({ email: 'a@b.com', password: 'x' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

    expect(findLoginByEmail).toHaveBeenCalledWith(prisma, 'a@b.com');
    // Não sobrou nenhuma consulta a `tenant` — a conta já carrega o tenant.
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('rejeita usuário inativo com o mesmo código de credencial inválida', async () => {
    const { service } = serviceWith({});
    mockLogin({
      is_active: false,
      tenant: { is_active: true, tenantPlan: null },
    });

    await expect(
      service.login({ email: 'a@b.com', password: 'x' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('rejeita tenant inativo com o mesmo código de credencial inválida (não distingue do e-mail inexistente)', async () => {
    const { service } = serviceWith({});
    mockLogin({
      is_active: true,
      password_hash: await argon2.hash('senha-certa'),
      tenant: { is_active: false, tenantPlan: null },
    });

    await expect(
      service.login({ email: 'a@b.com', password: 'senha-certa' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('rejeita senha incorreta', async () => {
    const { service } = serviceWith({});
    const hash = await argon2.hash('senha-certa');
    mockLogin({
      id: 'u1',
      is_active: true,
      password_hash: hash,
      congregation_id: 'c1',
      roleAssignments: [],
      tenant: { is_active: true, tenantPlan: null },
    });

    await expect(
      service.login({ email: 'a@b.com', password: 'senha-errada' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('devolve tokens com o tenant_id resolvido da própria conta, e filtra papéis pela congregação do usuário', async () => {
    const { service, prisma } = serviceWith({});
    const hash = await argon2.hash('senha-certa');
    mockLogin({
      id: 'u1',
      tenant_id: 't1',
      is_active: true,
      password_hash: hash,
      congregation_id: 'c1',
      roleAssignments: [
        { role_code: 'tenant_admin', congregation_id: 'c1' },
        { role_code: 'secretary', congregation_id: 'outra-congregacao' },
      ],
      tenant: { is_active: true, tenantPlan: { plan: 'premium' } },
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const result = await service.login({ email: 'a@b.com', password: 'senha-certa' });

    expect(result).toEqual({ access_token: 'signed-token', refresh_token: expect.any(String), expires_in: 900 });
    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.tenant_id).toBe('t1');
    expect(payload.roles).toEqual(['tenant_admin']);
    expect(payload.plan).toBe('premium');
  });

  it('usa "starter" quando o tenant não tem plano', async () => {
    const { service, prisma } = serviceWith({});
    const hash = await argon2.hash('senha-certa');
    mockLogin({
      id: 'u1',
      tenant_id: 't1',
      is_active: true,
      password_hash: hash,
      congregation_id: 'c1',
      roleAssignments: [],
      tenant: { is_active: true, tenantPlan: null },
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    await service.login({ email: 'a@b.com', password: 'senha-certa' });

    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.plan).toBe('starter');
  });
});

describe('AuthService — limite de tentativas nas rotas de credencial', () => {
  // A pendência dizia: "A porta do console é a que mais interessa fechar: ela
  // dá acesso a POST /auth/impersonate, e daí a qualquer tenant."
  function accountThatNeverMatches(prisma: PrismaService) {
    mockLogin(null);
    (prisma.userAccount.findMany as jest.Mock).mockResolvedValue([]);
  }

  it('login: a sexta tentativa leva 429 em vez de 401', async () => {
    const { service, prisma } = serviceWith({});
    accountThatNeverMatches(prisma);
    const credentials = { email: 'a@b.com', password: 'errada' };

    for (let i = 0; i < 5; i++) {
      await expect(service.login(credentials)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    }

    await expect(service.login(credentials)).rejects.toMatchObject({
      status: 429,
      response: { code: 'TOO_MANY_ATTEMPTS' },
    });
  });

  // A chave do rate limit deixou de incluir tenant (`user_accounts.email` é
  // único em todo o banco agora — não há mais "o mesmo e-mail em outro
  // tenant" a isolar). O que resta a confirmar é que o bloqueio continua
  // isolado por e-mail: um e-mail bloqueado não afeta outro.
  it('login: o bloqueio é só por e-mail — outro e-mail não é afetado', async () => {
    const { service, prisma } = serviceWith({});
    accountThatNeverMatches(prisma);

    for (let i = 0; i < 5; i++) {
      await expect(
        service.login({ email: 'a@b.com', password: 'errada' }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    }

    await expect(
      service.login({ email: 'outro@b.com', password: 'errada' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('login: acerto de senha zera a janela', async () => {
    const { service, prisma, rateLimit } = serviceWith({});
    mockLogin(null);

    for (let i = 0; i < 3; i++) {
      await expect(
        service.login({ email: 'a@b.com', password: 'errada' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }

    const key = LoginRateLimitService.key('login', 'a@b.com');
    expect(await rateLimit.check(key, LOGIN_POLICY)).toBe(true);

    mockLogin({
      id: 'u1',
      tenant_id: 't1',
      is_active: true,
      password_hash: await argon2.hash('certa'),
      congregation_id: 'c1',
      roleAssignments: [],
      tenant: { is_active: true, tenantPlan: null },
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    await service.login({ email: 'a@b.com', password: 'certa' });

    expect(
      (prisma.system.loginAttempt.deleteMany as jest.Mock).mock.calls.at(-1)?.[0],
    ).toEqual({ where: { identifier: key } });
  });

  it('login de plataforma: a sexta tentativa leva 429', async () => {
    const { service } = serviceWith({});
    mockLogin(null);
    const credentials = { email: 'suporte@orbien.com', password: 'errada' };

    for (let i = 0; i < 5; i++) {
      await expect(service.platformLogin(credentials)).rejects.toMatchObject({
        response: { code: 'INVALID_CREDENTIALS' },
      });
    }

    await expect(service.platformLogin(credentials)).rejects.toMatchObject({
      status: 429,
      response: { code: 'TOO_MANY_ATTEMPTS' },
    });
    // E o 429 sai antes de buscar a conta: a busca é o custo que o limite
    // existe para conter.
    expect((findLoginByEmail as jest.Mock).mock.calls).toHaveLength(5);
  });
});

describe('AuthService.refresh', () => {
  it('rejeita token não encontrado', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, null);

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token válido cuja conta a função não devolve: 401, sem rotacionar nem emitir token', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
    });

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(findSessionByUserId).toHaveBeenCalledWith(prisma, 'u1');
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('reuso de token revogado derruba toda a família e barra o acesso', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: new Date('2020-01-01'),
      expires_at: new Date('2999-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        is_active: true,
        roleAssignments: [],
        tenant: { tenantPlan: null, is_active: true },
      },
    });

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);
    // A escrita roda no contexto do DONO do token (`own_tokens`), com o tenant.
    expect(withRefreshContext).toHaveBeenCalledWith(prisma, { userId: 'u1', tenantId: 't1' }, expect.any(Function));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { user_account_id: 'u1', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it('rejeita token expirado', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2020-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        is_active: true,
        roleAssignments: [],
        tenant: { tenantPlan: null, is_active: true },
      },
    });

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toMatchObject({
      message: 'Sessão expirada',
    });
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('conta desativada não rotaciona, e a família inteira é revogada', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        is_active: false,
        roleAssignments: [{ role_code: 'platform_support', congregation_id: null }],
        tenant: { tenantPlan: { plan: 'premium' } },
      },
    });

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);

    // Nada de token novo: nem o refresh rotacionado, nem o access token.
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();

    // E a cadeia inteira morre, como na detecção de reuso.
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { user_account_id: 'u1', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it('rotaciona o token e devolve novo par, filtrando papéis pela congregação', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        is_active: true,
        roleAssignments: [{ role_code: 'tenant_admin', congregation_id: 'c1' }],
        tenant: { tenantPlan: { plan: 'premium' }, is_active: true },
      },
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'rtk-2' });

    const result = await service.refresh({ refresh_token: 'rt' });

    expect(result).toEqual({ access_token: 'signed-token', refresh_token: expect.any(String), expires_in: 900 });
    // A reivindicação é condicional (`revoked_at: null` no WHERE) — é o que
    // decide, sob corrida, quem rotaciona de verdade. Ver o teste de "perdeu
    // a corrida" logo abaixo.
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'rtk-1', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rtk-1' },
      data: { replaced_by_id: 'rtk-2' },
    });
  });

  it('perdeu a corrida da reivindicação: trata como reuso, revoga a família e não cria token novo', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        is_active: true,
        roleAssignments: [{ role_code: 'tenant_admin', congregation_id: 'c1' }],
        tenant: { tenantPlan: { plan: 'premium' }, is_active: true },
      },
    });
    // A leitura lá em cima ainda viu `revoked_at: null`, mas outra chamada —
    // duas abas, ou o mobile e o web ao mesmo tempo — já reivindicou este
    // token entre a leitura e a tentativa de rotação. `count: 0` é essa
    // corrida perdida.
    (prisma.refreshToken.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();

    // A família cai inteira, como em qualquer reuso — inclusive o token que
    // "ganhou" em algum outro lugar concorrente: o cliente reage do mesmo
    // jeito (login de novo) nos dois lados.
    expect(prisma.refreshToken.updateMany).toHaveBeenLastCalledWith({
      where: { user_account_id: 'u1', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it('usa "starter" quando o tenant do usuário não tem plano', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        is_active: true,
        roleAssignments: [],
        tenant: { tenantPlan: null, is_active: true },
      },
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'rtk-2' });

    await service.refresh({ refresh_token: 'rt' });

    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.plan).toBe('starter');
  });

  it('tenant inativado não rotaciona, e a família inteira é revogada', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        is_active: true,
        roleAssignments: [{ role_code: 'tenant_admin', congregation_id: 'c1' }],
        tenant: { tenantPlan: { plan: 'premium' }, is_active: false },
      },
    });

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(jwtService.sign).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { user_account_id: 'u1', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });
});

describe('AuthService.logout', () => {
  it('revoga o refresh token pelo hash', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, {
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
      userAccount: { id: 'u1', tenant_id: 't1', congregation_id: 'c1', is_active: true },
    });

    await expect(service.logout('rt')).resolves.toEqual({ message: 'Sessão encerrada.' });
    expect(withRefreshContext).toHaveBeenCalledWith(prisma, { userId: 'u1', tenantId: 't1' }, expect.any(Function));
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { token_hash: expect.any(String), revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it('hash desconhecido: idempotente, não escreve nada', async () => {
    const { service, prisma } = serviceWith({});
    mockStored(prisma, null);

    await expect(service.logout('rt')).resolves.toEqual({ message: 'Sessão encerrada.' });
    expect(withRefreshContext).not.toHaveBeenCalled();
    expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('AuthService — o argon2.verify roda em todos os caminhos do login', () => {
  /**
   * Não mede tempo (flaky por natureza): prova que a mesma operação cara roda
   * antes de qualquer decisão. Sem isto, e-mail inexistente respondia antes do
   * verify e o tempo de resposta diferenciava conta existente de inexistente.
   */
  const senha = 'senha-errada';
  const verifyCalls = () => (argon2.verify as jest.Mock).mock.calls;

  async function linha(overrides: Record<string, unknown> = {}) {
    return {
      user_id: 'u1',
      tenant_id: 't1',
      congregation_id: 'c1',
      password_hash: await argon2.hash('senha-certa'),
      is_active: true,
      tenant_is_active: true,
      plan: null,
      roles: [{ role_code: 'platform_support', congregation_id: 'c1' }],
      ...overrides,
    };
  }

  async function erroDe(fn: () => Promise<unknown>) {
    return fn().then(
      () => {
        throw new Error('devia ter recusado');
      },
      (e: UnauthorizedException) => e,
    );
  }

  it('o hash fixo tem o mesmo custo de uma conta real (parâmetros padrão de argon2.hash)', async () => {
    expect(DUMMY_PASSWORD_HASH.startsWith('$argon2id$')).toBe(true);
    // `needsRehash` é false só quando m/t/p do hash batem com os padrões atuais.
    expect(argon2.needsRehash(DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await argon2.verify(DUMMY_PASSWORD_HASH, 'qualquer-coisa')).toBe(false);
  });

  it('login — sem conta: verify roda contra o hash fixo, com a senha enviada', async () => {
    const { service } = serviceWith({});
    mockLogin(null);

    await erroDe(() => service.login({ email: 'nao@existe.test', password: senha }));

    expect(verifyCalls()).toEqual([[DUMMY_PASSWORD_HASH, senha]]);
  });

  it('login — senha errada, conta inativa e tenant inativo: verify roda contra o hash REAL', async () => {
    const real = await argon2.hash('senha-certa');
    for (const overrides of [
      {},
      { is_active: false },
      { tenant_is_active: false },
    ]) {
      (argon2.verify as jest.Mock).mockClear();
      const { service } = serviceWith({});
      (findLoginByEmail as jest.Mock).mockResolvedValue(await linha({ password_hash: real, ...overrides }));

      await erroDe(() => service.login({ email: 'a@b.test', password: senha }));

      expect(verifyCalls()).toEqual([[real, senha]]);
    }
  });

  it('login — o hash fixo nunca autentica: mesmo acertando a senha dele, sem conta é 401', async () => {
    const { service } = serviceWith({});
    mockLogin(null);
    const e = await erroDe(() => service.login({ email: 'nao@existe.test', password: DUMMY_PASSWORD_HASH }));
    expect(e).toBeInstanceOf(UnauthorizedException);
    expect(findLoginByEmail).toHaveBeenCalled();
  });

  it('login — as quatro recusas continuam indistinguíveis (corpo idêntico)', async () => {
    const real = await argon2.hash('senha-certa');
    const respostas: unknown[] = [];
    for (const row of [
      null, // inexistente
      await linha({ password_hash: real }), // senha errada
      await linha({ password_hash: real, is_active: false }), // inativa
      await linha({ password_hash: real, tenant_is_active: false }), // tenant inativo
    ]) {
      const { service } = serviceWith({});
      (findLoginByEmail as jest.Mock).mockResolvedValue(row);
      const e = await erroDe(() => service.login({ email: 'a@b.test', password: senha }));
      respostas.push(e.getResponse());
    }
    expect(new Set(respostas.map((r) => JSON.stringify(r))).size).toBe(1);
    expect(respostas[0]).toEqual({ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  });

  it('platformLogin — sem conta, sem o papel e inativa: verify roda nos três', async () => {
    const real = await argon2.hash('senha-certa');
    const casos: Array<[string, unknown, string]> = [
      ['sem conta', null, DUMMY_PASSWORD_HASH],
      ['sem o papel', await linha({ password_hash: real, roles: [{ role_code: 'tenant_admin', congregation_id: 'c1' }] }), real],
      ['inativa', await linha({ password_hash: real, is_active: false }), real],
    ];
    const respostas: unknown[] = [];
    for (const [, row, esperado] of casos) {
      (argon2.verify as jest.Mock).mockClear();
      const { service } = serviceWith({});
      (findLoginByEmail as jest.Mock).mockResolvedValue(row);

      const e = await erroDe(() => service.platformLogin({ email: 'p@o.test', password: senha }));

      expect(verifyCalls()).toEqual([[esperado, senha]]);
      respostas.push(e.getResponse());
    }
    expect(new Set(respostas.map((r) => JSON.stringify(r))).size).toBe(1);
  });

  it('login válido continua emitindo token (o verify extra não mudou o caminho feliz)', async () => {
    const { service } = serviceWith({});
    (findLoginByEmail as jest.Mock).mockResolvedValue(await linha({ roles: [{ role_code: 'member', congregation_id: 'c1' }] }));

    await expect(service.login({ email: 'a@b.test', password: 'senha-certa' })).resolves.toMatchObject({
      access_token: 'signed-token',
    });
    expect(verifyCalls()).toHaveLength(1);
  });
});

describe('AuthService.platformLogin', () => {
  /**
   * A rota do console tinha só cobertura de integração. Estes testes prendem as
   * decisões que o teste por HTTP não distingue bem: a busca por `findUnique`
   * (zero ou uma conta, nunca mais — `email` é único em todo o banco), o
   * desempate pelo papel, e a indistinguibilidade das recusas.
   */
  async function contaComSenha(overrides: Record<string, unknown> = {}) {
    return {
      id: 'u1',
      tenant_id: 't1',
      congregation_id: 'c1',
      is_active: true,
      password_hash: await argon2.hash('senha-certa'),
      roleAssignments: [{ role_code: 'platform_support', congregation_id: 'c1' }],
      tenant: { tenantPlan: { plan: 'premium' } },
      ...overrides,
    };
  }

  const credenciais = { email: 'suporte@orbien.test', password: 'senha-certa' };

  it('só considera conta ativa e com o papel de plataforma', async () => {
    const { service, prisma } = serviceWith({});
    mockLogin(null);

    await expect(service.platformLogin(credenciais)).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });

    expect(findLoginByEmail).toHaveBeenCalledWith(prisma, credenciais.email);
  });

  it('conta sem o papel de plataforma devolve o mesmo INVALID_CREDENTIALS', async () => {
    const { service } = serviceWith({});
    mockLogin(
      await contaComSenha({ roleAssignments: [{ role_code: 'tenant_admin', congregation_id: 'c1' }] }),
    );

    await expect(service.platformLogin(credenciais)).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('conta inativa devolve o mesmo INVALID_CREDENTIALS', async () => {
    const { service } = serviceWith({});
    mockLogin(
      await contaComSenha({ is_active: false }),
    );

    await expect(service.platformLogin(credenciais)).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });

  // O ponto não é o status, é a indistinguibilidade: quem tenta entrar com
  // credencial boa de tenant_admin não pode descobrir pela mensagem que ela
  // serve em outro lugar.
  it('senha errada devolve o mesmo INVALID_CREDENTIALS da conta sem papel', async () => {
    const { service } = serviceWith({});
    mockLogin(await contaComSenha());

    await expect(
      service.platformLogin({ ...credenciais, password: 'senha-errada' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('emite token com o tenant e a congregação resolvidos no servidor', async () => {
    const { service, prisma } = serviceWith({});
    mockLogin(await contaComSenha());
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const result = await service.platformLogin(credenciais);

    expect(result).toMatchObject({ access_token: 'signed-token', expires_in: 900 });
    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload).toMatchObject({
      sub: 'u1',
      tenant_id: 't1',
      congregation_id: 'c1',
      plan: 'premium',
    });
    expect(payload.roles).toContain('platform_support');
  });

  // O tenant de origem pode não ter plano (provisionamento interrompido). O
  // fallback existe para o token sair mesmo assim.
  it('conta sem plano no tenant sai como starter', async () => {
    const { service, prisma } = serviceWith({});
    mockLogin(
      await contaComSenha({ tenant: { tenantPlan: null } }),
    );
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    await service.platformLogin(credenciais);

    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.plan).toBe('starter');
  });

  // `platform_support` é global: `app_is_platform_support()` não filtra por
  // congregação. Sem a união em `rolesForToken`, uma atribuicao feita em outra
  // congregação do tenant sumiria do token e o console cairia a cada renovação.
  it('inclui platform_support atribuído em outra congregação do tenant', async () => {
    const { service, prisma } = serviceWith({});
    mockLogin(
      await contaComSenha({
        roleAssignments: [{ role_code: 'platform_support', congregation_id: 'outra' }],
      }),
    );
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    await service.platformLogin(credenciais);

    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.roles).toEqual(['platform_support']);
  });
});

describe('AuthService.impersonate', () => {
  const requester: JwtPayload = {
    sub: 'support-1',
    tenant_id: 'support-tenant',
    congregation_id: 'support-cong',
    roles: ['platform_support'],
    plan: 'starter',
  };

  beforeEach(() => {
    (findImpersonateTarget as jest.Mock).mockReset();
  });

  /**
   * O papel vem de `role_assignments`, não do `roles` do JWT — e os dois
   * primeiros testes existem para prender a inversão nos dois sentidos. Antes
   * era `requestingUser.roles.includes('platform_support')`, o que fazia um
   * papel revogado continuar valendo por até 15 minutos, com a cadeia de
   * refresh renovando.
   */
  function comAtor(
    _prisma: PrismaService,
    encontrado: boolean,
    overrides: Record<string, unknown> = {},
  ): void {
    (findSessionByUserId as jest.Mock).mockResolvedValue(
      encontrado
        ? {
            user_id: requester.sub,
            tenant_id: 'support-tenant',
            congregation_id: 'support-cong',
            is_active: true,
            tenant_is_active: true,
            plan: null,
            roles: [{ role_code: 'platform_support', congregation_id: 'support-cong' }],
            ...overrides,
          }
        : null,
    );
  }

  it('barra quem o banco não confirma, mesmo com o papel no token', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, false);

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Nem chega a olhar o tenant alvo: a autorização vem antes.
    expect(findImpersonateTarget).not.toHaveBeenCalled();
  });

  it('libera quem o banco confirma, mesmo sem o papel no token', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (findImpersonateTarget as jest.Mock).mockResolvedValue({
      tenant_id: 'target',
      plan: null,
      congregation_id: 'target-cong',
    });
    const semPapelNoToken: JwtPayload = { ...requester, roles: [] };

    await expect(
      service.impersonate(semPapelNoToken, { target_tenant_id: 'target' }),
    ).resolves.toMatchObject({ access_token: 'signed-token' });
  });

  // O `is_active` é redundância deliberada (o `JwtStrategy` já o confere em toda
  // requisição), mas o serviço não deve depender de o guard estar montado.
  it('consulta o ator por id exato, pelo banco', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, false);

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findSessionByUserId).toHaveBeenCalledWith(prisma, requester.sub);
  });

  it('barra conta inativa, mesmo com o papel no banco', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true, { is_active: false });

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findImpersonateTarget).not.toHaveBeenCalled();
  });

  it('barra conta ativa sem platform_support no banco, mesmo com o papel no token', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true, { roles: [{ role_code: 'tenant_admin', congregation_id: 'support-cong' }] });

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findImpersonateTarget).not.toHaveBeenCalled();
  });

  it('rejeita tenant alvo inexistente', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (findImpersonateTarget as jest.Mock).mockResolvedValue(null);

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita tenant sem nenhuma congregação', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (findImpersonateTarget as jest.Mock).mockResolvedValue({
      tenant_id: 'target',
      plan: null,
      congregation_id: null,
    });

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emite token marcado support_session, com o tenant e a congregação do alvo', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (findImpersonateTarget as jest.Mock).mockResolvedValue({
      tenant_id: 'target',
      plan: 'premium',
      congregation_id: 'target-cong',
    });

    const result = await service.impersonate(requester, { target_tenant_id: 'target' });

    // TTL curto e diferente do token comum (900s): sessão de suporte não tem
    // refresh, e a única forma de renovar é reautorizar pelo banco.
    expect(result).toEqual({ access_token: 'signed-token', expires_in: 300 });
    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload).toMatchObject({
      sub: requester.sub,
      tenant_id: 'target',
      congregation_id: 'target-cong',
      support_session: true,
      impersonated_by: requester.sub,
    });
  });

  it('usa "starter" quando o tenant alvo não tem plano', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (findImpersonateTarget as jest.Mock).mockResolvedValue({
      tenant_id: 'target',
      plan: null,
      congregation_id: 'target-cong',
    });

    await service.impersonate(requester, { target_tenant_id: 'target' });

    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.plan).toBe('starter');
  });
});

describe('AuthService.forgotPassword', () => {
  it('devolve a mesma mensagem genérica quando o usuário não existe (busca só por e-mail, sem tenant_slug)', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.forgotPassword({ email: 'a@b.com' });
    expect(result.message).toMatch(/Se o email estiver cadastrado/);
    expect(prisma.system.passwordResetToken.create).not.toHaveBeenCalled();
    expect(prisma.system.userAccount.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'a@b.com' } }),
    );
  });

  it('devolve a mesma mensagem genérica quando o usuário está inativo', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({ is_active: false });

    const result = await service.forgotPassword({ email: 'a@b.com' });
    expect(result.message).toMatch(/Se o email estiver cadastrado/);
  });

  it('no caminho feliz invalida tokens antigos, cria um novo e envia o email', async () => {
    const { service, prisma, mail } = serviceWith({});
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      is_active: true,
      person: { full_name: 'Ana Silva' },
    });

    const result = await service.forgotPassword({ email: 'a@b.com' });

    expect(result.message).toMatch(/Se o email estiver cadastrado/);
    expect(prisma.system.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'u1', used_at: null },
      data: { used_at: expect.any(Date) },
    });
    expect(prisma.system.passwordResetToken.create).toHaveBeenCalled();
    expect(mail.sendPasswordReset).toHaveBeenCalledWith('a@b.com', expect.stringContaining('/redefinir-senha?token='), 'Ana', expect.objectContaining({ kind: expect.any(String) }));
  });

  it('pedido do web/app sai com a marca da igreja do tenant da conta', async () => {
    const { service, prisma, mail } = serviceWith({});
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      is_active: true,
      person: { full_name: 'Ana Silva' },
      tenant: {
        name: 'Igreja Teste 1',
        brandingConfig: { primary_color: '#7A1F2B', secondary_color: null, logo_url: null },
      },
    });

    await service.forgotPassword({ email: 'a@b.com' });

    expect(mail.sendPasswordReset).toHaveBeenCalledWith(
      'a@b.com',
      expect.any(String),
      'Ana',
      expect.objectContaining({ kind: 'tenant', name: 'Igreja Teste 1', primaryColor: '#7A1F2B' }),
    );
  });

  describe('platformForgotPassword (console)', () => {
    const ORIGINAL_ADMIN_URL = process.env['ADMIN_URL'];

    afterEach(() => {
      if (ORIGINAL_ADMIN_URL === undefined) delete process.env['ADMIN_URL'];
      else process.env['ADMIN_URL'] = ORIGINAL_ADMIN_URL;
    });

    const platformAccount = (role_code: string) => ({
      id: 'u1',
      email: 'a@b.com',
      is_active: true,
      person: { full_name: 'Ana Silva' },
      tenant: { name: 'Igreja Teste 1', brandingConfig: null },
      roleAssignments: [{ role_code }],
    });

    it('conta com platform_support recebe o e-mail com a marca da Orbien e o link do admin', async () => {
      process.env['ADMIN_URL'] = 'https://admin.useorbien.com';
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue(platformAccount('platform_support'));

      const result = await service.platformForgotPassword({ email: 'a@b.com' });

      expect(result.message).toMatch(/Se o email estiver cadastrado/);
      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^https:\/\/admin\.useorbien\.com\/redefinir-senha\?token=/),
        'Ana',
        expect.objectContaining({ kind: 'platform', name: 'Orbien' }),
      );
    });

    it('conta sem platform_support recebe a mesma resposta genérica e nenhum e-mail', async () => {
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue(platformAccount('tenant_admin'));

      const result = await service.platformForgotPassword({ email: 'a@b.com' });

      expect(result.message).toMatch(/Se o email estiver cadastrado/);
      expect(prisma.system.passwordResetToken.create).not.toHaveBeenCalled();
      expect(mail.sendPasswordReset).not.toHaveBeenCalled();
    });

    it('cai no admin local (3003) quando ADMIN_URL não está definida', async () => {
      delete process.env['ADMIN_URL'];
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue(platformAccount('platform_support'));

      await service.platformForgotPassword({ email: 'a@b.com' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^http:\/\/localhost:3003\/redefinir-senha\?token=/),
        'Ana',
        expect.anything(),
      );
    });
  });

  describe('FRONTEND_URL no link de redefinição', () => {
    const ORIGINAL_FRONTEND_URL = process.env['FRONTEND_URL'];

    afterEach(() => {
      if (ORIGINAL_FRONTEND_URL === undefined) {
        delete process.env['FRONTEND_URL'];
      } else {
        process.env['FRONTEND_URL'] = ORIGINAL_FRONTEND_URL;
      }
    });

    it('usa FRONTEND_URL do ambiente quando definida', async () => {
      process.env['FRONTEND_URL'] = 'https://web.useorbien.com';
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        is_active: true,
        person: { full_name: 'Ana Silva' },
      });

      await service.forgotPassword({ email: 'a@b.com' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringContaining('https://web.useorbien.com/redefinir-senha?token='),
        'Ana',
        expect.anything(),
      );
    });

    it('cai para localhost:3001 quando FRONTEND_URL não está definida', async () => {
      delete process.env['FRONTEND_URL'];
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        is_active: true,
        person: { full_name: 'Ana Silva' },
      });

      await service.forgotPassword({ email: 'a@b.com' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringContaining('http://localhost:3001/redefinir-senha?token='),
        'Ana',
        expect.anything(),
      );
    });
  });

  it('usa string vazia como primeiro nome quando a pessoa não tem full_name', async () => {
    const { service, prisma, mail } = serviceWith({});
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      is_active: true,
      person: null,
    });

    await service.forgotPassword({ email: 'a@b.com' });

    expect(mail.sendPasswordReset).toHaveBeenCalledWith('a@b.com', expect.any(String), '', expect.anything());
  });

  it('usa FRONTEND_URL do ambiente quando definida, em vez do default de localhost', async () => {
    const original = process.env['FRONTEND_URL'];
    process.env['FRONTEND_URL'] = 'https://app.orbien.com.br';
    try {
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        is_active: true,
        person: null,
      });

      await service.forgotPassword({ email: 'a@b.com' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^https:\/\/app\.orbien\.com\.br\/redefinir-senha\?token=/),
        '',
        expect.anything(),
      );
    } finally {
      if (original === undefined) delete process.env['FRONTEND_URL'];
      else process.env['FRONTEND_URL'] = original;
    }
  });

  it('cai no default de localhost quando FRONTEND_URL não está definida', async () => {
    const original = process.env['FRONTEND_URL'];
    delete process.env['FRONTEND_URL'];
    try {
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        is_active: true,
        person: null,
      });

      await service.forgotPassword({ email: 'a@b.com' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^http:\/\/localhost:3001\/redefinir-senha\?token=/),
        '',
        expect.anything(),
      );
    } finally {
      if (original === undefined) delete process.env['FRONTEND_URL'];
      else process.env['FRONTEND_URL'] = original;
    }
  });

  it('acima do limite de tentativas por hora, devolve genérico sem consultar a conta', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue(null);

    for (let i = 0; i < 3; i++) {
      await service.forgotPassword({ email: 'limite@b.com' });
    }
    (prisma.system.userAccount.findUnique as jest.Mock).mockClear();

    const result = await service.forgotPassword({ email: 'limite@b.com' });
    expect(result.message).toMatch(/Se o email estiver cadastrado/);
    expect(prisma.system.userAccount.findUnique).not.toHaveBeenCalled();
  });
});

describe('AuthService.resetPassword', () => {
  it('rejeita token inexistente', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.passwordResetToken.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.resetPassword({ token: 'x', password: 'segredo123' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejeita token já usado', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'tok-1',
      user_id: 'u1',
      used_at: new Date(),
      expires_at: new Date('2999-01-01'),
    });

    await expect(service.resetPassword({ token: 'x', password: 'segredo123' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejeita token expirado', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'tok-1',
      user_id: 'u1',
      used_at: null,
      expires_at: new Date('2020-01-01'),
    });

    await expect(service.resetPassword({ token: 'x', password: 'segredo123' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('no caminho feliz troca a senha, marca o token usado e derruba as sessões', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.passwordResetToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'tok-1',
      user_id: 'u1',
      used_at: null,
      expires_at: new Date('2999-01-01'),
    });

    const result = await service.resetPassword({ token: 'x', password: 'segredo-novo' });

    expect(result).toEqual({ message: 'Senha redefinida com sucesso.' });
    expect(prisma.system.$transaction).toHaveBeenCalled();
  });
});
