import { Prisma } from '@prisma/client';
import {
  AuthTokensRetentionService,
  LOGIN_ATTEMPTS_RETENTION_DAYS,
  PASSWORD_RESET_RETENTION_DAYS,
  REFRESH_TOKEN_RETENTION_DAYS,
} from './auth-tokens-retention.service';
import { RETENTION_BATCH, RETENTION_MAX_BATCHES } from '../persons/logs-consent-retention.service';
import { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function serviceWith(executeRaw: jest.Mock) {
  return new AuthTokensRetentionService({ system: { $executeRaw: executeRaw } } as unknown as PrismaService);
}
const sqlOf = (call: unknown[]): Prisma.Sql => call[0] as Prisma.Sql;
const cutoffOf = (sql: Prisma.Sql) => (sql.values.find((v) => v instanceof Date) as Date).getTime();

describe('AuthTokensRetentionService', () => {
  it('prazos: 7 dias, 7 dias e 30 dias', async () => {
    const exec = jest.fn().mockResolvedValue(0);
    const svc = serviceWith(exec);
    await svc.purgeLoginAttempts(NOW);
    await svc.purgePasswordResetTokens(NOW);
    await svc.purgeRefreshTokens(NOW);

    expect(cutoffOf(sqlOf(exec.mock.calls[0]!))).toBe(NOW.getTime() - LOGIN_ATTEMPTS_RETENTION_DAYS * DAY);
    expect(cutoffOf(sqlOf(exec.mock.calls[1]!))).toBe(NOW.getTime() - PASSWORD_RESET_RETENTION_DAYS * DAY);
    expect(cutoffOf(sqlOf(exec.mock.calls[2]!))).toBe(NOW.getTime() - REFRESH_TOKEN_RETENTION_DAYS * DAY);
    expect(LOGIN_ATTEMPTS_RETENTION_DAYS).toBe(7);
    expect(PASSWORD_RESET_RETENTION_DAYS).toBe(7);
    expect(REFRESH_TOKEN_RETENTION_DAYS).toBe(30);
  });

  it('refresh_tokens: corta por expires_at (nunca por revoked_at) e apaga o pai antes do filho', async () => {
    const exec = jest.fn().mockResolvedValue(0);
    await serviceWith(exec).purgeRefreshTokens(NOW);
    const sql = sqlOf(exec.mock.calls[0]!).sql;
    expect(sql).toContain('r.expires_at <');
    expect(sql).not.toContain('revoked_at');
    expect(sql).toContain('ORDER BY r.expires_at');
  });

  it('login_attempts: usa o mais recente entre window_at e blocked_at', async () => {
    const exec = jest.fn().mockResolvedValue(0);
    await serviceWith(exec).purgeLoginAttempts(NOW);
    expect(sqlOf(exec.mock.calls[0]!).sql).toContain('GREATEST(l.window_at, COALESCE(l.blocked_at, l.window_at))');
  });

  it('restringe o escopo só quando pedido', async () => {
    const exec = jest.fn().mockResolvedValue(0);
    const svc = serviceWith(exec);
    await svc.purgeLoginAttempts(NOW, 'login:x');
    await svc.purgeLoginAttempts(NOW);
    await svc.purgeRefreshTokens(NOW, ['u1']);
    await svc.purgeRefreshTokens(NOW);
    expect(sqlOf(exec.mock.calls[0]!).sql).toContain('l.identifier LIKE');
    expect(sqlOf(exec.mock.calls[1]!).sql).not.toContain('l.identifier LIKE');
    expect(sqlOf(exec.mock.calls[2]!).sql).toContain('r.user_account_id IN');
    expect(sqlOf(exec.mock.calls[3]!).sql).not.toContain('r.user_account_id IN');
  });

  it('apaga em lotes, é idempotente e respeita o teto por rodada', async () => {
    const exec = jest.fn().mockResolvedValueOnce(RETENTION_BATCH).mockResolvedValueOnce(7);
    expect(await serviceWith(exec).purgeRefreshTokens(NOW)).toEqual({ deleted: RETENTION_BATCH + 7, failed: false });

    expect(await serviceWith(jest.fn().mockResolvedValue(0)).purgeRefreshTokens(NOW)).toEqual({ deleted: 0, failed: false });

    const full = jest.fn().mockResolvedValue(RETENTION_BATCH);
    const res = await serviceWith(full).purgePasswordResetTokens(NOW);
    expect(full).toHaveBeenCalledTimes(RETENTION_MAX_BATCHES);
    expect(res.deleted).toBe(RETENTION_MAX_BATCHES * RETENTION_BATCH);
  });

  it('falha no meio preserva o já apagado e sinaliza', async () => {
    const exec = jest.fn().mockResolvedValueOnce(RETENTION_BATCH).mockRejectedValueOnce(new Error('boom'));
    expect(await serviceWith(exec).purgeLoginAttempts(NOW)).toEqual({ deleted: RETENTION_BATCH, failed: true });
  });

  it('o cron roda os três; falha de lote é contida e não impede os outros', async () => {
    const exec = jest.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(0);
    await expect(serviceWith(exec).cronPurgeAuthTokens()).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('o cron também contém uma exceção que escape do job e segue para os demais', async () => {
    const svc = serviceWith(jest.fn().mockResolvedValue(0));
    jest.spyOn(svc, 'purgeLoginAttempts').mockRejectedValue(new Error('boom'));
    const reset = jest.spyOn(svc, 'purgePasswordResetTokens');
    const refresh = jest.spyOn(svc, 'purgeRefreshTokens');

    await expect(svc.cronPurgeAuthTokens()).resolves.toBeUndefined();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
