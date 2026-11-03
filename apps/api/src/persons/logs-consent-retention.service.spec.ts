import { Prisma } from '@prisma/client';
import {
  CONSENT_RETENTION_YEARS,
  FINANCIAL_AUDIT_ENTITIES,
  LogsConsentRetentionService,
  RETENTION_BATCH,
  RETENTION_MAX_BATCHES,
} from './logs-consent-retention.service';
import { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2026-11-02T12:00:00.000Z');

function serviceWith(executeRaw: jest.Mock) {
  const prisma = { system: { $executeRaw: executeRaw } } as unknown as PrismaService;
  return new LogsConsentRetentionService(prisma);
}

const sqlOf = (call: unknown[]): Prisma.Sql => call[0] as Prisma.Sql;

describe('LogsConsentRetentionService', () => {
  describe('purgeExpiredAuditLogs', () => {
    it('corta no prazo de 2 anos contados de audit_logs.at', async () => {
      const exec = jest.fn().mockResolvedValue(0);
      await serviceWith(exec).purgeExpiredAuditLogs(NOW);

      const sql = sqlOf(exec.mock.calls[0]!);
      expect(sql.sql).toContain('a.at <');
      const cutoff = sql.values.find((v) => v instanceof Date) as Date;
      expect(cutoff.toISOString()).toBe('2024-11-02T12:00:00.000Z');
    });

    it('poupa dado financeiro e quem tem vínculo financeiro', async () => {
      const exec = jest.fn().mockResolvedValue(0);
      await serviceWith(exec).purgeExpiredAuditLogs(NOW);

      const sql = sqlOf(exec.mock.calls[0]!);
      expect(sql.sql).toContain('a.entity NOT IN');
      for (const e of FINANCIAL_AUDIT_ENTITIES) expect(sql.values).toContain(e);
      expect(sql.sql).toContain('financial_transactions');
      expect(sql.sql).toContain('pix_payments');
    });

    it('restringe ao tenant quando pedido e não restringe quando não', async () => {
      const exec = jest.fn().mockResolvedValue(0);
      await serviceWith(exec).purgeExpiredAuditLogs(NOW, 't1');
      await serviceWith(exec).purgeExpiredAuditLogs(NOW);

      expect(sqlOf(exec.mock.calls[0]!).sql).toContain('a.tenant_id =');
      expect(sqlOf(exec.mock.calls[1]!).sql).not.toContain('a.tenant_id =');
    });

    it('apaga em lotes até o lote voltar incompleto', async () => {
      const exec = jest
        .fn()
        .mockResolvedValueOnce(RETENTION_BATCH)
        .mockResolvedValueOnce(RETENTION_BATCH)
        .mockResolvedValueOnce(7);

      const res = await serviceWith(exec).purgeExpiredAuditLogs(NOW);

      expect(res).toEqual({ deleted: 2 * RETENTION_BATCH + 7, failed: false });
      expect(exec).toHaveBeenCalledTimes(3);
    });

    it('é idempotente: segunda rodada sem nada vencido apaga zero', async () => {
      const exec = jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(0);
      const svc = serviceWith(exec);

      expect((await svc.purgeExpiredAuditLogs(NOW)).deleted).toBe(5);
      expect((await svc.purgeExpiredAuditLogs(NOW)).deleted).toBe(0);
    });

    it('respeita o teto de lotes por rodada', async () => {
      const exec = jest.fn().mockResolvedValue(RETENTION_BATCH);

      const res = await serviceWith(exec).purgeExpiredAuditLogs(NOW);

      expect(exec).toHaveBeenCalledTimes(RETENTION_MAX_BATCHES);
      expect(res.deleted).toBe(RETENTION_MAX_BATCHES * RETENTION_BATCH);
    });

    it('falha no meio devolve o que já foi apagado e marca a falha', async () => {
      const exec = jest
        .fn()
        .mockResolvedValueOnce(RETENTION_BATCH)
        .mockRejectedValueOnce(new Error('conexão caiu'));

      const res = await serviceWith(exec).purgeExpiredAuditLogs(NOW);

      expect(res).toEqual({ deleted: RETENTION_BATCH, failed: true });
    });
  });

  describe('purgeExpiredConsents', () => {
    it('corta 5 anos depois da revogação e nunca toca consentimento não revogado', async () => {
      const exec = jest.fn().mockResolvedValue(0);
      await serviceWith(exec).purgeExpiredConsents(NOW);

      const sql = sqlOf(exec.mock.calls[0]!);
      expect(sql.sql).toContain('c.revoked_at IS NOT NULL');
      const cutoff = sql.values.find((v) => v instanceof Date) as Date;
      expect(cutoff.toISOString()).toBe(`${NOW.getUTCFullYear() - CONSENT_RETENTION_YEARS}-11-02T12:00:00.000Z`);
    });

    it('poupa consentimento de doador e filtra por tenant quando pedido', async () => {
      const exec = jest.fn().mockResolvedValue(0);
      await serviceWith(exec).purgeExpiredConsents(NOW, 't1');

      const sql = sqlOf(exec.mock.calls[0]!);
      expect(sql.sql).toContain('financial_transactions');
      expect(sql.sql).toContain('c.tenant_id =');
    });

    it('apaga em lotes e reporta falha parcial', async () => {
      const exec = jest.fn().mockResolvedValueOnce(RETENTION_BATCH).mockRejectedValueOnce(new Error('x'));
      expect(await serviceWith(exec).purgeExpiredConsents(NOW)).toEqual({ deleted: RETENTION_BATCH, failed: true });
    });
  });

  describe('cron', () => {
    it('roda os dois jobs e uma falha não impede o outro', async () => {
      const exec = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(0);
      const svc = serviceWith(exec);

      await expect(svc.cronPurgeExpiredLogsAndConsents()).resolves.toBeUndefined();
      expect(exec).toHaveBeenCalledTimes(2);
    });

    it('não propaga exceção inesperada de um job', async () => {
      const svc = serviceWith(jest.fn().mockResolvedValue(0));
      jest.spyOn(svc, 'purgeExpiredAuditLogs').mockRejectedValue(new Error('inesperado'));
      const consents = jest.spyOn(svc, 'purgeExpiredConsents');

      await expect(svc.cronPurgeExpiredLogsAndConsents()).resolves.toBeUndefined();
      expect(consents).toHaveBeenCalled();
    });
  });
});
