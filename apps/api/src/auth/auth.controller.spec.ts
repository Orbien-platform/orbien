import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ROLES_KEY } from './decorators/roles.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';

function serviceMock() {
  return {
    login: jest.fn().mockResolvedValue({ access_token: 'a', refresh_token: 'r', expires_in: 900 }),
    refresh: jest.fn().mockResolvedValue({ access_token: 'a2', refresh_token: 'r2', expires_in: 900 }),
    logout: jest.fn().mockResolvedValue({ message: 'Sessão encerrada.' }),
    forgotPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
    impersonate: jest.fn().mockResolvedValue({ access_token: 'imp', expires_in: 900 }),
  } as unknown as AuthService;
}

const user: JwtPayload = {
  sub: 'support-1',
  tenant_id: 't1',
  congregation_id: 'c1',
  roles: ['platform_support'],
  plan: 'starter',
};

describe('AuthController', () => {
  it('login delega ao AuthService com o DTO', async () => {
    const service = serviceMock();
    const controller = new AuthController(service);
    const dto = { email: 'a@b.com', password: 'x', tenant_slug: 'doca' };

    await expect(controller.login(dto)).resolves.toEqual({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 900,
    });
    expect(service.login).toHaveBeenCalledWith(dto);
  });

  it('refresh delega ao AuthService com o DTO', async () => {
    const service = serviceMock();
    const controller = new AuthController(service);
    const dto = { refresh_token: 'rt' };

    await controller.refresh(dto);
    expect(service.refresh).toHaveBeenCalledWith(dto);
  });

  it('logout delega ao AuthService com o refresh_token do corpo', async () => {
    const service = serviceMock();
    const controller = new AuthController(service);

    await controller.logout({ refresh_token: 'rt' });
    expect(service.logout).toHaveBeenCalledWith('rt');
  });

  it('forgotPassword delega ao AuthService com o DTO', async () => {
    const service = serviceMock();
    const controller = new AuthController(service);
    const dto = { email: 'a@b.com', tenant_slug: 'doca' };

    await controller.forgotPassword(dto);
    expect(service.forgotPassword).toHaveBeenCalledWith(dto);
  });

  it('resetPassword delega ao AuthService com o DTO', async () => {
    const service = serviceMock();
    const controller = new AuthController(service);
    const dto = { token: 'tok', password: 'segredo123' };

    await controller.resetPassword(dto);
    expect(service.resetPassword).toHaveBeenCalledWith(dto);
  });

  it('impersonate delega ao AuthService com o user do token e o DTO', async () => {
    const service = serviceMock();
    const controller = new AuthController(service);
    const dto = { target_tenant_id: '123e4567-e89b-12d3-a456-426614174000' };

    await controller.impersonate(user, dto);
    expect(service.impersonate).toHaveBeenCalledWith(user, dto);
  });

  it('só a rota impersonate exige @Roles — as demais são públicas ou só JwtAuthGuard', () => {
    const reflector = new Reflector();
    const withRoles = reflector.get(ROLES_KEY, AuthController.prototype.impersonate);
    expect(withRoles).toEqual(['platform_support']);

    for (const handler of ['login', 'refresh', 'logout', 'forgotPassword', 'resetPassword'] as const) {
      expect(
        reflector.get(ROLES_KEY, AuthController.prototype[handler]),
      ).toBeUndefined();
    }
  });

  it('login, platformLogin e forgotPassword têm ThrottlerGuard por IP, além do limite por e-mail do serviço', () => {
    const reflector = new Reflector();

    const cases = [
      { handler: 'login', limit: 20, ttl: 900_000 },
      { handler: 'platformLogin', limit: 10, ttl: 900_000 },
      { handler: 'forgotPassword', limit: 10, ttl: 3_600_000 },
    ] as const;

    for (const { handler, limit, ttl } of cases) {
      const method = AuthController.prototype[handler];
      const guards = Reflect.getMetadata('__guards__', method) as unknown[];
      expect(guards).toContain(ThrottlerGuard);
      expect(reflector.get<number>('THROTTLER:LIMITdefault', method)).toBe(limit);
      expect(reflector.get<number>('THROTTLER:TTLdefault', method)).toBe(ttl);
    }

    // refresh e resetPassword não guardam credencial nova por identificador
    // (o primeiro exige posse do refresh token; o segundo, do token de reset) —
    // não levam o guard de IP.
    for (const handler of ['refresh', 'resetPassword'] as const) {
      const guards = Reflect.getMetadata('__guards__', AuthController.prototype[handler]) as
        | unknown[]
        | undefined;
      expect(guards ?? []).not.toContain(ThrottlerGuard);
    }
  });
});
