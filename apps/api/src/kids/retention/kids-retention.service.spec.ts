import { Logger } from '@nestjs/common';
import { KidsRetentionService, KIDS_CHECKIN_RETENTION_MONTHS } from './kids-retention.service';
import { PrismaService } from '../../prisma/prisma.service';

const NOW = new Date('2026-10-26T12:00:00.000Z');

function build(batches: Array<Array<{ id: string }>>, updateImpl?: jest.Mock) {
  const findMany = jest.fn();
  for (const b of batches) findMany.mockResolvedValueOnce(b);
  findMany.mockResolvedValue([]);
  const updateMany = updateImpl ?? jest.fn().mockResolvedValue({ count: 1 });
  const prisma = { system: { kidsCheckin: { findMany, updateMany } } } as unknown as PrismaService;
  return { svc: new KidsRetentionService(prisma), findMany, updateMany };
}

describe('KidsRetentionService.anonymizeExpiredCheckins (KIDS-06, retenção de 12 meses)', () => {
  it('corta em exatamente 12 meses: só é elegível o check-in ANTERIOR ao corte', async () => {
    const { svc, findMany } = build([]);
    await svc.anonymizeExpiredCheckins(NOW);

    expect(KIDS_CHECKIN_RETENTION_MONTHS).toBe(12);
    const where = findMany.mock.calls[0][0].where;
    // `lt`, nunca `lte`: um check-in de exatamente 12 meses atrás ainda não passou do prazo.
    expect(where.checked_in_at).toEqual({ lt: new Date('2025-10-26T12:00:00.000Z') });
  });

  it('só olha o que ainda não foi anonimizado (idempotência) e pula responsável membro ativo', async () => {
    const { svc, findMany } = build([]);
    await svc.anonymizeExpiredCheckins(NOW);

    const where = findMany.mock.calls[0][0].where;
    expect(where.anonymized_at).toBeNull();
    // Membro ativo = classification member, sem deleted_at e sem anonymized_at.
    expect(where.guardian).toEqual({
      isNot: { classification: 'member', deleted_at: null, anonymized_at: null },
    });
  });

  it('limpa a identificação e preserva horário, turma e criança (contagem e indicadores)', async () => {
    const { svc, updateMany } = build([[{ id: 'k1' }]]);
    const res = await svc.anonymizeExpiredCheckins(NOW);

    expect(res).toEqual({ anonymized: 1, failed: 0 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'k1', anonymized_at: null },
      data: {
        picked_up_by_name: null,
        picked_up_by_person_id: null,
        override_reason: null,
        anonymized_at: NOW,
      },
    });
    const data = updateMany.mock.calls[0][0].data;
    for (const keep of ['checked_in_at', 'checked_out_at', 'session_id', 'child_id', 'guardian_person_id', 'code']) {
      expect(data).not.toHaveProperty(keep);
    }
  });

  it('segunda execução não conta de novo o que outra execução já anonimizou (count 0)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const { svc } = build([[{ id: 'k1' }]], updateMany);
    expect(await svc.anonymizeExpiredCheckins(NOW)).toEqual({ anonymized: 0, failed: 0 });
  });

  it('falha em um registro não derruba o job: os demais seguem e a falha é contada', async () => {
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValueOnce({ count: 1 });
    const { svc } = build([[{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }]], updateMany);

    const res = await svc.anonymizeExpiredCheckins(NOW);

    expect(res).toEqual({ anonymized: 2, failed: 1 });
    expect(updateMany).toHaveBeenCalledTimes(3);
  });

  it('percorre em lotes sem reler o que já passou (cursor por id)', async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({ id: `a${String(i).padStart(3, '0')}` }));
    const { svc, findMany, updateMany } = build([full, [{ id: 'b001' }]]);

    const res = await svc.anonymizeExpiredCheckins(NOW);

    expect(res.anonymized).toBe(201);
    expect(updateMany).toHaveBeenCalledTimes(201);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1][0].where.id).toEqual({ gt: 'a199' });
  });

  it('o cron chama o job e registra quantos foram anonimizados e quantos falharam', async () => {
    const { svc, updateMany } = build([[{ id: 'a1' }, { id: 'a2' }]]);
    updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error('lock'));
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await svc.cronAnonymizeExpiredCheckins();

    expect(log).toHaveBeenCalledWith('Retenção de check-in kids: 1 anonimizado(s), 1 falha(s)');
    log.mockRestore();
  });

  it('o cron chama o job e não propaga erro de consulta (próxima rodada tenta de novo)', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('db fora'));
    const svc = new KidsRetentionService({ system: { kidsCheckin: { findMany } } } as unknown as PrismaService);
    await expect(svc.cronAnonymizeExpiredCheckins()).resolves.toBeUndefined();
  });
});

describe('KidsRetentionService: escopo opcional por tenant', () => {
  it('restringe a consulta ao tenant informado; sem ele varre todos', async () => {
    const a = build([]);
    await a.svc.anonymizeExpiredCheckins(NOW, 't2');
    expect(a.findMany.mock.calls[0][0].where.tenant_id).toBe('t2');

    const b = build([]);
    await b.svc.anonymizeExpiredCheckins(NOW);
    expect(b.findMany.mock.calls[0][0].where).not.toHaveProperty('tenant_id');
  });
});
