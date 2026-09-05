/**
 * O limitador que fechou a pendência "sem limite de tentativa no login da
 * plataforma".
 *
 * O que estes testes travam é o que o `Map` por processo não conseguia dar: a
 * contagem sobrevive fora do processo (aqui, um fake com estado no lugar da
 * tabela), o bloqueio expira sozinho, e credencial certa zera a janela.
 */
import { HttpStatus } from '@nestjs/common';
import {
  LoginRateLimitService,
  LOGIN_POLICY,
  PASSWORD_RESET_POLICY,
} from './login-rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';

interface Row {
  identifier: string;
  count: number;
  window_at: Date;
  blocked_at: Date | null;
}

function serviceWithStore() {
  const rows = new Map<string, Row>();
  const loginAttempt = {
    findUnique: async ({ where }: { where: { identifier: string } }) =>
      rows.get(where.identifier) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { identifier: string };
      create: Row;
      update: Partial<Row>;
    }) => {
      const existing = rows.get(where.identifier);
      rows.set(where.identifier, existing ? { ...existing, ...update } : { ...create });
    },
    update: async ({ where, data }: { where: { identifier: string }; data: Partial<Row> }) => {
      const existing = rows.get(where.identifier);
      if (existing) rows.set(where.identifier, { ...existing, ...data });
    },
    delete: async ({ where }: { where: { identifier: string } }) => {
      rows.delete(where.identifier);
    },
    deleteMany: async ({ where }: { where: { identifier: string } }) => {
      rows.delete(where.identifier);
    },
  };

  const prisma = { system: { loginAttempt } } as unknown as PrismaService;
  return { service: new LoginRateLimitService(prisma), rows };
}

describe('LoginRateLimitService.key', () => {
  it('normaliza o e-mail e separa por rota', () => {
    expect(LoginRateLimitService.key('platform-login', '  Ana@Example.com ')).toBe(
      'platform-login:ana@example.com',
    );
    // Bloquear no console não pode bloquear o login do produto: chaves
    // diferentes para o mesmo e-mail.
    expect(LoginRateLimitService.key('login:doca', 'a@b.com')).not.toBe(
      LoginRateLimitService.key('platform-login', 'a@b.com'),
    );
  });
});

describe('LoginRateLimitService', () => {
  const key = 'platform-login:a@b.com';

  it('libera enquanto a conta de falhas não estoura a política', async () => {
    const { service } = serviceWithStore();

    for (let i = 0; i < LOGIN_POLICY.max - 1; i++) {
      await expect(service.check(key, LOGIN_POLICY)).resolves.toBe(true);
      await service.register(key, LOGIN_POLICY);
    }

    expect(await service.check(key, LOGIN_POLICY)).toBe(true);
  });

  it('bloqueia na enésima falha, e o `assert` responde 429', async () => {
    const { service } = serviceWithStore();

    for (let i = 0; i < LOGIN_POLICY.max; i++) await service.register(key, LOGIN_POLICY);

    expect(await service.check(key, LOGIN_POLICY)).toBe(false);
    await expect(service.assert(key, LOGIN_POLICY)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: 'TOO_MANY_ATTEMPTS' },
    });
  });

  it('o bloqueio vence sozinho depois da janela', async () => {
    const { service, rows } = serviceWithStore();

    for (let i = 0; i < LOGIN_POLICY.max; i++) await service.register(key, LOGIN_POLICY);
    expect(await service.check(key, LOGIN_POLICY)).toBe(false);

    // Envelhece o bloqueio para além da janela, em vez de esperar 15 minutos.
    const row = rows.get(key)!;
    row.blocked_at = new Date(Date.now() - LOGIN_POLICY.windowMs - 1);

    expect(await service.check(key, LOGIN_POLICY)).toBe(true);
    // E a linha some: a próxima falha recomeça a contagem do zero.
    expect(rows.has(key)).toBe(false);
  });

  it('janela vencida sem bloqueio recomeça a contagem em 1', async () => {
    const { service, rows } = serviceWithStore();

    await service.register(key, LOGIN_POLICY);
    await service.register(key, LOGIN_POLICY);
    expect(rows.get(key)!.count).toBe(2);

    rows.get(key)!.window_at = new Date(Date.now() - LOGIN_POLICY.windowMs - 1);
    await service.register(key, LOGIN_POLICY);

    expect(rows.get(key)!.count).toBe(1);
  });

  it('`clear` zera a janela — é o que o acerto de senha faz', async () => {
    const { service, rows } = serviceWithStore();

    for (let i = 0; i < LOGIN_POLICY.max; i++) await service.register(key, LOGIN_POLICY);
    expect(await service.check(key, LOGIN_POLICY)).toBe(false);

    await service.clear(key);

    expect(rows.has(key)).toBe(false);
    expect(await service.check(key, LOGIN_POLICY)).toBe(true);
  });

  it('cada política conta com os próprios números', async () => {
    const { service } = serviceWithStore();
    const resetKey = 'reset:doca:a@b.com';

    // 3 por hora, e não 5: `forgot-password` mantém o limite que já tinha.
    for (let i = 0; i < PASSWORD_RESET_POLICY.max; i++) {
      expect(await service.check(resetKey, PASSWORD_RESET_POLICY)).toBe(true);
      await service.register(resetKey, PASSWORD_RESET_POLICY);
    }

    expect(await service.check(resetKey, PASSWORD_RESET_POLICY)).toBe(false);
    expect(PASSWORD_RESET_POLICY.max).toBeLessThan(LOGIN_POLICY.max);
  });

  it('linha sem bloqueio nunca barra, mesmo com contagem alta', async () => {
    const { service, rows } = serviceWithStore();
    rows.set(key, { identifier: key, count: 99, window_at: new Date(), blocked_at: null });

    // É `blocked_at` que barra, não a contagem: sem ele a janela segue aberta.
    expect(await service.check(key, LOGIN_POLICY)).toBe(true);
  });
});
