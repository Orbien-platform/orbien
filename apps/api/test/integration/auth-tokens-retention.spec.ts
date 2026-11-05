/**
 * Retenção de login_attempts, password_reset_tokens e refresh_tokens contra o
 * Postgres real, incluindo a prova de que a detecção de reuso de refresh token
 * segue funcionando dentro da janela de retenção. Só `teste2-church`; apaga o
 * que criou.
 */
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { AppModule } from '../../src/app.module';
import { AuthService } from '../../src/auth/auth.service';
import { AuthTokensRetentionService } from '../../src/auth/auth-tokens-retention.service';
import { RETENTION_BATCH } from '../../src/persons/logs-consent-retention.service';
import { loadTestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const tag = `tokret-${Date.now()}`;
const NOW = new Date('2026-11-04T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY + extraMs);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

let auth: AuthService;
let svc: AuthTokensRetentionService;
let close: () => Promise<void>;
let userId: string;
let userIds: string[];
const ids: Record<string, string> = {};

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  close = () => app.close();
  auth = app.get(AuthService);
  svc = app.get(AuthTokensRetentionService);

  const t2 = await loadTestTenant(admin, 'teste2-church');
  userId = (
    await admin.userAccount.create({
      data: { tenant_id: t2.tenantId, congregation_id: t2.congregationId, email: `${tag}@teste2.fake`, password_hash: 'x', is_active: true },
    })
  ).id;
  userIds = [userId];
}, 120_000);

afterAll(async () => {
  if (userId) {
    await admin.refreshToken.updateMany({ where: { user_account_id: userId }, data: { replaced_by_id: null } });
    await admin.refreshToken.deleteMany({ where: { user_account_id: userId } });
    await admin.passwordResetToken.deleteMany({ where: { user_id: userId } });
    await admin.userAccount.deleteMany({ where: { id: userId } });
  }
  await admin.loginAttempt.deleteMany({ where: { identifier: { startsWith: tag } } });
  await close?.();
  await admin.$disconnect();
}, 60_000);

describe('login_attempts', () => {
  beforeAll(async () => {
    const mk = async (name: string, window_at: Date, blocked_at: Date | null = null) => {
      ids[name] = (await admin.loginAttempt.create({ data: { identifier: `${tag}:${name}`, count: 3, window_at, blocked_at } })).id;
    };
    await mk('la-velha', ago(7, -1000));
    await mk('la-limite', ago(7));
    await mk('la-recente', ago(1));
    // janela velha, mas bloqueada há pouco: o bloqueio manda
    await mk('la-bloqueio-recente', ago(30), ago(1));
  });
  const exists = async (n: string) => (await admin.loginAttempt.count({ where: { id: ids[n]! } })) === 1;

  it('apaga a vencida, poupa limite, recente e bloqueio recente; idempotente', async () => {
    expect(await svc.purgeLoginAttempts(NOW, tag)).toEqual({ deleted: 1, failed: false });
    expect(await exists('la-velha')).toBe(false);
    for (const k of ['la-limite', 'la-recente', 'la-bloqueio-recente']) expect(await exists(k)).toBe(true);
    expect((await svc.purgeLoginAttempts(NOW, tag)).deleted).toBe(0);
  });

  it('o limite exato vira elegível 1 ms depois', async () => {
    expect((await svc.purgeLoginAttempts(new Date(NOW.getTime() + 1), tag)).deleted).toBe(1);
    expect(await exists('la-limite')).toBe(false);
  });
});

describe('password_reset_tokens', () => {
  beforeAll(async () => {
    const mk = async (name: string, expires_at: Date, used_at: Date | null = null) => {
      ids[name] = (await admin.passwordResetToken.create({ data: { user_id: userId, token: `${tag}-${name}`, expires_at, used_at } })).id;
    };
    await mk('pr-velho', ago(7, -1000));
    await mk('pr-usado-velho', ago(8), ago(8));
    await mk('pr-limite', ago(7));
    await mk('pr-recente', ago(1));
  });
  const exists = async (n: string) => (await admin.passwordResetToken.count({ where: { id: ids[n]! } })) === 1;

  it('apaga o expirado há mais de 7 dias (usado ou não) e poupa limite e recente', async () => {
    expect(await svc.purgePasswordResetTokens(NOW, userIds)).toEqual({ deleted: 2, failed: false });
    expect(await exists('pr-velho')).toBe(false);
    expect(await exists('pr-usado-velho')).toBe(false);
    expect(await exists('pr-limite')).toBe(true);
    expect(await exists('pr-recente')).toBe(true);
    expect((await svc.purgePasswordResetTokens(NOW, userIds)).deleted).toBe(0);
  });

  it('limite exato vira elegível 1 ms depois', async () => {
    expect((await svc.purgePasswordResetTokens(new Date(NOW.getTime() + 1), userIds)).deleted).toBe(1);
  });
});

describe('refresh_tokens', () => {
  const mk = async (name: string, expires_at: Date, revoked_at: Date | null, replaced_by_id: string | null = null) => {
    ids[name] = (
      await admin.refreshToken.create({
        data: { user_account_id: userId, token_hash: sha(`${tag}-${name}`), expires_at, revoked_at, replaced_by_id },
      })
    ).id;
  };
  const exists = async (n: string) => (await admin.refreshToken.count({ where: { id: ids[n]! } })) === 1;

  beforeAll(async () => {
    // cadeia pai -> filho, ambos vencidos há mais de 30 dias (pai expira antes)
    await mk('rt-filho', ago(31, 1), ago(40));
    await mk('rt-pai', ago(31, 0), ago(40), ids['rt-filho']);
    await mk('rt-limite', ago(30), ago(31));
    await mk('rt-recente-revogado', ago(10), ago(11));
    await mk('rt-vivo', new Date(NOW.getTime() + 7 * DAY), null);
    await mk('rt-vencido-nao-revogado', ago(45), null);
  });

  it('apaga o vencido há mais de 30 dias (cadeia inclusa, sem violar a FK) e poupa o resto', async () => {
    expect(await svc.purgeRefreshTokens(NOW, userIds)).toEqual({ deleted: 3, failed: false });
    for (const g of ['rt-pai', 'rt-filho', 'rt-vencido-nao-revogado']) expect(await exists(g)).toBe(false);
    for (const k of ['rt-limite', 'rt-recente-revogado', 'rt-vivo']) expect(await exists(k)).toBe(true);
  });

  it('idempotente; limite exato vira elegível 1 ms depois', async () => {
    expect((await svc.purgeRefreshTokens(NOW, userIds)).deleted).toBe(0);
    expect((await svc.purgeRefreshTokens(new Date(NOW.getTime() + 1), userIds)).deleted).toBe(1);
    expect(await exists('rt-limite')).toBe(false);
  });

  it('em lote: mais de 1 lote de vencidos sai inteiro, com cadeias', async () => {
    const total = RETENTION_BATCH + 50;
    await admin.$executeRawUnsafe(
      `INSERT INTO refresh_tokens (id, user_account_id, token_hash, expires_at, revoked_at)
       SELECT gen_random_uuid(), $1, md5(random()::text) || $2 || g, $3::timestamp - (g || ' seconds')::interval, $3::timestamp
       FROM generate_series(1, $4) g`,
      userId, tag, ago(60).toISOString(), total,
    );
    const res = await svc.purgeRefreshTokens(NOW, userIds);
    expect(res).toEqual({ deleted: total, failed: false });
  });
});

describe('detecção de reuso de refresh token segue valendo dentro da retenção', () => {
  it('token revogado ainda retido: apresentá-lo derruba a família inteira', async () => {
    const velho = `${tag}-reuso-velho`;
    const vivo = `${tag}-reuso-vivo`;
    const filho = await admin.refreshToken.create({
      data: { user_account_id: userId, token_hash: sha(vivo), expires_at: new Date(Date.now() + 7 * DAY) },
    });
    await admin.refreshToken.create({
      data: {
        user_account_id: userId,
        token_hash: sha(velho),
        // vencido há 20 dias: dentro dos 30 de retenção, a linha tem que sobreviver à limpeza
        expires_at: new Date(Date.now() - 20 * DAY),
        revoked_at: new Date(Date.now() - 21 * DAY),
        replaced_by_id: filho.id,
      },
    });

    await svc.purgeRefreshTokens(new Date(), userIds);
    expect(await admin.refreshToken.count({ where: { token_hash: sha(velho) } })).toBe(1);

    await expect(auth.refresh({ refresh_token: velho })).rejects.toThrow(/encerrada por segurança/);
    expect((await admin.refreshToken.findUnique({ where: { id: filho.id } }))!.revoked_at).not.toBeNull();
  });

  it('depois da retenção a linha some e o token é só "inválido" (sem família viva para proteger)', async () => {
    const velho = `${tag}-reuso-expirado`;
    await admin.refreshToken.create({
      data: {
        user_account_id: userId,
        token_hash: sha(velho),
        expires_at: new Date(Date.now() - 31 * DAY),
        revoked_at: new Date(Date.now() - 38 * DAY),
      },
    });
    await svc.purgeRefreshTokens(new Date(), userIds);
    await expect(auth.refresh({ refresh_token: velho })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.refresh({ refresh_token: velho })).rejects.toThrow('Token inválido');
  });
});
