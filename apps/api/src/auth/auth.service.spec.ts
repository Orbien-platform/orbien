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
    userAccount: { findUnique: jest.fn() },
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

describe('AuthService.impersonate', () => {
  const requester: JwtPayload = {
    sub: 'support-1',
    tenant_id: 'support-tenant',
    congregation_id: 'support-cong',
    roles: ['platform_support'],
    plan: 'starter',
  };

  it('barra quem não tem platform_support', async () => {
    const { service } = serviceWith({});
    const naoSuporte: JwtPayload = { ...requester, roles: ['tenant_admin'] };

    await expect(
      service.impersonate(naoSuporte, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejeita tenant alvo inexistente', async () => {
    const { service, prisma } = serviceWith({});
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      service.impersonate(requester, { target_tenant_id: 'target' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejeita tenant sem nenhuma congregação', async () => {
    const { service, prisma } = serviceWith({});
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
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({
      id: 'target',
      tenantPlan: { plan: 'premium' },
      congregations: [{ id: 'target-cong' }],
    });

    const result = await service.impersonate(requester, { target_tenant_id: 'target' });

    expect(result).toEqual({ access_token: 'signed-token', expires_in: 900 });
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
