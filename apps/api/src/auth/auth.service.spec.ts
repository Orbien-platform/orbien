/**
 * `auth.service.ts` é a maior superfície de segurança sem teste do projeto:
 * login, refresh (com detecção de reuso), reset de senha e impersonate. O
 * foco aqui não é só "cobre a linha", é travar o comportamento que, se
 * quebrar, vaza sessão ou credencial:
 *
 *   - refresh de um token já revogado derruba a família inteira (reuso é
 *     sinal de token roubado);
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
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const jwtService = { sign: jest.fn().mockReturnValue('signed-token') } as unknown as JwtService;
const configService = {} as unknown as ConfigService;

function mailMock() {
  return { sendPasswordReset: jest.fn().mockResolvedValue(undefined) } as unknown as MailService;
}

function serviceWith(prismaOverrides: Record<string, unknown>, mail = mailMock()) {
  const prisma = {
    tenant: { findUnique: jest.fn() },
    userAccount: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    refreshToken: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    system: {
      tenant: { findUnique: jest.fn() },
      userAccount: { findUnique: jest.fn(), update: jest.fn() },
      passwordResetToken: { findUnique: jest.fn(), updateMany: jest.fn(), create: jest.fn(), update: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma.system)),
    },
    ...prismaOverrides,
  } as unknown as PrismaService;

  jwtService.sign = jest.fn().mockReturnValue('signed-token');
  const service = new AuthService(prisma, jwtService, configService, mail);
  return { service, prisma, mail };
}

describe('AuthService.login', () => {
  it('rejeita tenant inexistente', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.login({ email: 'a@b.com', password: 'x', tenant_slug: 'doca' }),
    ).rejects.toMatchObject({ response: { code: 'TENANT_NOT_FOUND' } });
  });

  it('rejeita quando o usuário não existe', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1', tenantPlan: null });
    (prisma.userAccount.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.login({ email: 'a@b.com', password: 'x', tenant_slug: 'doca' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('rejeita usuário inativo', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1', tenantPlan: null });
    (prisma.userAccount.findUnique as jest.Mock).mockResolvedValue({ is_active: false });

    await expect(
      service.login({ email: 'a@b.com', password: 'x', tenant_slug: 'doca' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita senha incorreta', async () => {
    const { service, prisma } = serviceWith({});
    const hash = await argon2.hash('senha-certa');
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1', tenantPlan: null });
    (prisma.userAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      is_active: true,
      password_hash: hash,
      congregation_id: 'c1',
      roleAssignments: [],
    });

    await expect(
      service.login({ email: 'a@b.com', password: 'senha-errada', tenant_slug: 'doca' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('devolve tokens e filtra papéis pela congregação do usuário', async () => {
    const { service, prisma } = serviceWith({});
    const hash = await argon2.hash('senha-certa');
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: 't1',
      tenantPlan: { plan: 'premium' },
    });
    (prisma.userAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      is_active: true,
      password_hash: hash,
      congregation_id: 'c1',
      roleAssignments: [
        { role_code: 'tenant_admin', congregation_id: 'c1' },
        { role_code: 'secretary', congregation_id: 'outra-congregacao' },
      ],
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const result = await service.login({ email: 'a@b.com', password: 'senha-certa', tenant_slug: 'doca' });

    expect(result).toEqual({ access_token: 'signed-token', refresh_token: expect.any(String), expires_in: 900 });
    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.roles).toEqual(['tenant_admin']);
    expect(payload.plan).toBe('premium');
  });

  it('usa "starter" quando o tenant não tem plano', async () => {
    const { service, prisma } = serviceWith({});
    const hash = await argon2.hash('senha-certa');
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1', tenantPlan: null });
    (prisma.userAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      is_active: true,
      password_hash: hash,
      congregation_id: 'c1',
      roleAssignments: [],
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    await service.login({ email: 'a@b.com', password: 'senha-certa', tenant_slug: 'doca' });

    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.plan).toBe('starter');
  });
});

describe('AuthService.refresh', () => {
  it('rejeita token não encontrado', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reuso de token revogado derruba toda a família e barra o acesso', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: new Date('2020-01-01'),
      expires_at: new Date('2999-01-01'),
    });

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { user_account_id: 'u1', revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });

  it('rejeita token expirado', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2020-01-01'),
    });

    await expect(service.refresh({ refresh_token: 'rt' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotaciona o token e devolve novo par, filtrando papéis pela congregação', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        roleAssignments: [{ role_code: 'tenant_admin', congregation_id: 'c1' }],
        tenant: { tenantPlan: { plan: 'premium' } },
      },
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'rtk-2' });

    const result = await service.refresh({ refresh_token: 'rt' });

    expect(result).toEqual({ access_token: 'signed-token', refresh_token: expect.any(String), expires_in: 900 });
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rtk-1' },
      data: { revoked_at: expect.any(Date), replaced_by_id: 'rtk-2' },
    });
  });

  it('usa "starter" quando o tenant do usuário não tem plano', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: 'rtk-1',
      user_account_id: 'u1',
      revoked_at: null,
      expires_at: new Date('2999-01-01'),
      userAccount: {
        id: 'u1',
        tenant_id: 't1',
        congregation_id: 'c1',
        roleAssignments: [],
        tenant: { tenantPlan: null },
      },
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ id: 'rtk-2' });

    await service.refresh({ refresh_token: 'rt' });

    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.plan).toBe('starter');
  });
});

describe('AuthService.logout', () => {
  it('revoga o refresh token pelo hash', async () => {
    const { service, prisma } = serviceWith({});

    await expect(service.logout('rt')).resolves.toEqual({ message: 'Sessão encerrada.' });
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { token_hash: expect.any(String), revoked_at: null },
      data: { revoked_at: expect.any(Date) },
    });
  });
});

describe('AuthService.platformLogin', () => {
  /**
   * A rota do console tinha só cobertura de integração. Estes testes prendem as
   * decisões que o teste por HTTP não distingue bem: o `where` que restringe as
   * candidatas, a indistinguibilidade das três recusas, e a ambiguidade.
   */
  async function contaComSenha(overrides: Record<string, unknown> = {}) {
    return {
      id: 'u1',
      tenant_id: 't1',
      congregation_id: 'c1',
      password_hash: await argon2.hash('senha-certa'),
      roleAssignments: [{ role_code: 'platform_support', congregation_id: 'c1' }],
      tenant: { tenantPlan: { plan: 'premium' } },
      ...overrides,
    };
  }

  const credenciais = { email: 'suporte@orbien.test', password: 'senha-certa' };

  it('só considera conta ativa e com o papel de plataforma', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.userAccount.findMany as jest.Mock).mockResolvedValue([]);

    await expect(service.platformLogin(credenciais)).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });

    const [args] = (prisma.userAccount.findMany as jest.Mock).mock.calls[0];
    expect(args.where).toMatchObject({
      email: credenciais.email,
      is_active: true,
      roleAssignments: { some: { role_code: 'platform_support' } },
    });
  });

  // O ponto não é o status, é a indistinguibilidade: quem tenta entrar com
  // credencial boa de tenant_admin não pode descobrir pela mensagem que ela
  // serve em outro lugar.
  it('senha errada devolve o mesmo INVALID_CREDENTIALS da conta sem papel', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.userAccount.findMany as jest.Mock).mockResolvedValue([await contaComSenha()]);

    await expect(
      service.platformLogin({ ...credenciais, password: 'senha-errada' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
  });

  it('mesmo e-mail com o papel em dois tenants falha alto, não escolhe um', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.userAccount.findMany as jest.Mock).mockResolvedValue([
      await contaComSenha({ id: 'u1', tenant_id: 't1' }),
      await contaComSenha({ id: 'u2', tenant_id: 't2' }),
    ]);

    await expect(service.platformLogin(credenciais)).rejects.toMatchObject({
      response: { code: 'PLATFORM_ACCOUNT_AMBIGUOUS' },
    });
    // Nenhum token emitido: escolher um poria o tenant errado em audit_logs.
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('emite token com o tenant e a congregação resolvidos no servidor', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.userAccount.findMany as jest.Mock).mockResolvedValue([await contaComSenha()]);
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
    (prisma.userAccount.findMany as jest.Mock).mockResolvedValue([
      await contaComSenha({ tenant: { tenantPlan: null } }),
    ]);
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
    (prisma.userAccount.findMany as jest.Mock).mockResolvedValue([
      await contaComSenha({
        roleAssignments: [{ role_code: 'platform_support', congregation_id: 'outra' }],
      }),
    ]);
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

  /**
   * O papel vem de `role_assignments`, não do `roles` do JWT — e os dois
   * primeiros testes existem para prender a inversão nos dois sentidos. Antes
   * era `requestingUser.roles.includes('platform_support')`, o que fazia um
   * papel revogado continuar valendo por até 15 minutos, com a cadeia de
   * refresh renovando.
   */
  function comAtor(prisma: PrismaService, encontrado: boolean): void {
    (prisma.userAccount.findFirst as jest.Mock).mockResolvedValue(
      encontrado ? { id: requester.sub } : null,
    );
  }

  it('barra quem o banco não confirma, mesmo com o papel no token', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, false);

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // Nem chega a olhar o tenant alvo: a autorização vem antes.
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('libera quem o banco confirma, mesmo sem o papel no token', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      tenantPlan: null,
      congregations: [{ id: 'target-cong' }],
    });
    const semPapelNoToken: JwtPayload = { ...requester, roles: [] };

    await expect(
      service.impersonate(semPapelNoToken, { target_tenant_id: 'target' }),
    ).resolves.toMatchObject({ access_token: 'signed-token' });
  });

  // A consulta filtra por conta ativa e pelo papel de uma vez — o `is_active`
  // é redundância deliberada (o `JwtStrategy` já o confere em toda requisição),
  // mas o serviço não deve depender de o guard estar montado.
  it('procura o ator por id, ativo e com o papel', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, false);

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const [args] = (prisma.userAccount.findFirst as jest.Mock).mock.calls[0];
    expect(args.where).toMatchObject({
      id: requester.sub,
      is_active: true,
      roleAssignments: { some: { role_code: 'platform_support' } },
    });
  });

  it('rejeita tenant alvo inexistente', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita tenant sem nenhuma congregação', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      tenantPlan: null,
      congregations: [],
    });

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emite token marcado support_session, com o tenant e a congregação do alvo', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      tenantPlan: { plan: 'premium' },
      congregations: [{ id: 'target-cong' }],
    });

    const result = await service.impersonate(requester, { target_tenant_id: 'target' });

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

  it('a sessão de suporte vale menos que um access token comum', async () => {
    // 5 minutos contra 15. A sessão de suporte não se renova — `impersonate`
    // não emite refresh token —, então o prazo é o único limite automático
    // que existe: nada além dele fecha a aba esquecida.
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      tenantPlan: { plan: 'starter' },
      congregations: [{ id: 'target-cong' }],
    });
    (jwtService.sign as jest.Mock).mockClear();

    await service.impersonate(requester, { target_tenant_id: 'target' });

    const [, options] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(options).toEqual({ expiresIn: '5m' });
  });

  it('usa "starter" quando o tenant alvo não tem plano', async () => {
    const { service, prisma } = serviceWith({});
    comAtor(prisma, true);
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      tenantPlan: null,
      congregations: [{ id: 'target-cong' }],
    });

    await service.impersonate(requester, { target_tenant_id: 'target' });

    const [payload] = (jwtService.sign as jest.Mock).mock.calls[0];
    expect(payload.plan).toBe('starter');
  });
});

describe('AuthService.forgotPassword', () => {
  it('devolve a mesma mensagem genérica quando o tenant não existe', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });
    expect(result.message).toMatch(/Se o email estiver cadastrado/);
  });

  it('devolve a mesma mensagem genérica quando o usuário não existe', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });
    expect(result.message).toMatch(/Se o email estiver cadastrado/);
    expect(prisma.system.passwordResetToken.create).not.toHaveBeenCalled();
  });

  it('devolve a mesma mensagem genérica quando o usuário está inativo', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({ is_active: false });

    const result = await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });
    expect(result.message).toMatch(/Se o email estiver cadastrado/);
  });

  it('no caminho feliz invalida tokens antigos, cria um novo e envia o email', async () => {
    const { service, prisma, mail } = serviceWith({});
    (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      is_active: true,
      person: { full_name: 'Ana Silva' },
    });

    const result = await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });

    expect(result.message).toMatch(/Se o email estiver cadastrado/);
    expect(prisma.system.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { user_id: 'u1', used_at: null },
      data: { used_at: expect.any(Date) },
    });
    expect(prisma.system.passwordResetToken.create).toHaveBeenCalled();
    expect(mail.sendPasswordReset).toHaveBeenCalledWith('a@b.com', expect.stringContaining('/redefinir-senha?token='), 'Ana');
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
      process.env['FRONTEND_URL'] = 'https://orbien-web.vercel.app';
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        is_active: true,
        person: { full_name: 'Ana Silva' },
      });

      await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringContaining('https://orbien-web.vercel.app/redefinir-senha?token='),
        'Ana',
      );
    });

    it('cai para localhost:3001 quando FRONTEND_URL não está definida', async () => {
      delete process.env['FRONTEND_URL'];
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        is_active: true,
        person: { full_name: 'Ana Silva' },
      });

      await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringContaining('http://localhost:3001/redefinir-senha?token='),
        'Ana',
      );
    });
  });

  it('usa string vazia como primeiro nome quando a pessoa não tem full_name', async () => {
    const { service, prisma, mail } = serviceWith({});
    (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
    (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      is_active: true,
      person: null,
    });

    await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });

    expect(mail.sendPasswordReset).toHaveBeenCalledWith('a@b.com', expect.any(String), '');
  });

  it('usa FRONTEND_URL do ambiente quando definida, em vez do default de localhost', async () => {
    const original = process.env['FRONTEND_URL'];
    process.env['FRONTEND_URL'] = 'https://app.orbien.com.br';
    try {
      const { service, prisma, mail } = serviceWith({});
      (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        is_active: true,
        person: null,
      });

      await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^https:\/\/app\.orbien\.com\.br\/redefinir-senha\?token=/),
        '',
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
      (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue({ id: 't1' });
      (prisma.system.userAccount.findUnique as jest.Mock).mockResolvedValue({
        id: 'u1',
        email: 'a@b.com',
        is_active: true,
        person: null,
      });

      await service.forgotPassword({ email: 'a@b.com', tenant_slug: 'doca' });

      expect(mail.sendPasswordReset).toHaveBeenCalledWith(
        'a@b.com',
        expect.stringMatching(/^http:\/\/localhost:3001\/redefinir-senha\?token=/),
        '',
      );
    } finally {
      if (original === undefined) delete process.env['FRONTEND_URL'];
      else process.env['FRONTEND_URL'] = original;
    }
  });

  it('acima do limite de tentativas por hora, devolve genérico sem consultar o tenant', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.system.tenant.findUnique as jest.Mock).mockResolvedValue(null);

    for (let i = 0; i < 3; i++) {
      await service.forgotPassword({ email: 'limite@b.com', tenant_slug: 'doca' });
    }
    (prisma.system.tenant.findUnique as jest.Mock).mockClear();

    const result = await service.forgotPassword({ email: 'limite@b.com', tenant_slug: 'doca' });
    expect(result.message).toMatch(/Se o email estiver cadastrado/);
    expect(prisma.system.tenant.findUnique).not.toHaveBeenCalled();
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
