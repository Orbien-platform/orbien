/**
 * Retenção de logs de auditoria (2 anos) e consentimentos (5 anos após a
 * revogação) contra o Postgres real. Roda só em `teste2-church` (escopo do
 * serviço restrito ao tenant) e apaga o que criou.
 */
import { PrismaClient, TransactionSource, TransactionType } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { LogsConsentRetentionService } from '../../src/persons/logs-consent-retention.service';
import { loadTestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const tag = `logret-${Date.now()}`;
const NOW = new Date('2026-11-02T12:00:00.000Z');
const yearsAgo = (y: number, extraMs = 0) => {
  const d = new Date(NOW);
  d.setUTCFullYear(d.getUTCFullYear() - y);
  return new Date(d.getTime() + extraMs);
};

let prisma: PrismaService;
let svc: LogsConsentRetentionService;
let scope: { tenant_id: string; congregation_id: string };
let accountId: string;
let categoryId: string;
let donorId: string;
let plainId: string;
const auditIds: Record<string, string> = {};
const consentIds: Record<string, string> = {};

async function audit(name: string, at: Date, data: { entity?: string; action?: string; subject?: string | null } = {}) {
  auditIds[name] = (
    await admin.auditLog.create({
      data: {
        tenant_id: scope.tenant_id,
        congregation_id: scope.congregation_id,
        actor_user_id: accountId,
        subject_person_id: data.subject ?? null,
        entity: data.entity ?? 'person',
        action: data.action ?? 'person.updated',
        ip: '203.0.113.9',
        at,
      },
    })
  ).id;
}

async function consent(name: string, personId: string, revokedAt: Date | null) {
  consentIds[name] = (
    await admin.consentRecord.create({
      data: { ...scope, person_id: personId, version: 'v1', consented_at: yearsAgo(8), revoked_at: revokedAt },
    })
  ).id;
}

beforeAll(async () => {
  prisma = new PrismaService();
  svc = new LogsConsentRetentionService(prisma);
  const t2 = await loadTestTenant(admin, 'teste2-church');
  scope = { tenant_id: t2.tenantId, congregation_id: t2.congregationId };
  accountId = (
    await admin.userAccount.create({ data: { ...scope, email: `${tag}@teste2.fake`, password_hash: 'x', is_active: true } })
  ).id;
  donorId = (await admin.person.create({ data: { ...scope, full_name: `Doador ${tag}`, classification: 'member' } })).id;
  plainId = (await admin.person.create({ data: { ...scope, full_name: `Comum ${tag}`, classification: 'member' } })).id;
  categoryId = (
    await admin.financialCategory.create({ data: { ...scope, name: `Cat ${tag}`, type: 'income' } })
  ).id;
  await admin.financialTransaction.create({
    data: {
      ...scope,
      type: TransactionType.income,
      amount: '10.00',
      occurred_at: yearsAgo(6),
      category_id: categoryId,
      source: TransactionSource.manual,
      created_by_user_id: accountId,
      donor_person_id: donorId,
    },
  });

  await audit('velho', yearsAgo(2, -1000));
  await audit('limite', yearsAgo(2));
  await audit('recente', yearsAgo(1));
  await audit('suporteVelho', yearsAgo(3), { action: 'support_access', entity: '/persons' });
  await audit('financeiroVelho', yearsAgo(7), { entity: 'financial_transaction', action: 'financial_transaction.updated' });
  await audit('doadorVelho', yearsAgo(4), { subject: donorId });
  await audit('comumVelho', yearsAgo(4), { subject: plainId });

  await consent('revogadoVelho', plainId, yearsAgo(5, -1000));
  await consent('revogadoLimite', plainId, yearsAgo(5));
  await consent('revogadoRecente', plainId, yearsAgo(1));
  await consent('nuncaRevogado', plainId, null);
  await consent('doadorRevogadoVelho', donorId, yearsAgo(6));
}, 120_000);

afterAll(async () => {
  if (!accountId) {
    await prisma?.$disconnect();
    await admin.$disconnect();
    return;
  }
  await admin.auditLog.deleteMany({ where: { actor_user_id: accountId } });
  await admin.consentRecord.deleteMany({ where: { person_id: { in: [donorId, plainId] } } });
  await admin.financialTransaction.deleteMany({ where: { category_id: categoryId } });
  await admin.financialCategory.deleteMany({ where: { id: categoryId } });
  await admin.person.deleteMany({ where: { full_name: { endsWith: tag } } });
  await admin.userAccount.deleteMany({ where: { id: accountId } });
  await prisma.$disconnect();
  await admin.$disconnect();
}, 60_000);

const auditExists = async (name: string) => (await admin.auditLog.count({ where: { id: auditIds[name]! } })) === 1;
const consentExists = async (name: string) => (await admin.consentRecord.count({ where: { id: consentIds[name]! } })) === 1;

describe('LogsConsentRetentionService (banco real)', () => {
  it('apaga log com mais de 2 anos e poupa o limite, o recente, o financeiro e o de doador', async () => {
    const res = await svc.purgeExpiredAuditLogs(NOW, scope.tenant_id);

    // velho + suporteVelho (mesmo prazo, nunca antes) + comumVelho
    expect(res).toEqual({ deleted: 3, failed: false });
    for (const gone of ['velho', 'suporteVelho', 'comumVelho']) expect(await auditExists(gone)).toBe(false);
    for (const kept of ['limite', 'recente', 'financeiroVelho', 'doadorVelho']) expect(await auditExists(kept)).toBe(true);
  });

  it('é idempotente', async () => {
    expect(await svc.purgeExpiredAuditLogs(NOW, scope.tenant_id)).toEqual({ deleted: 0, failed: false });
  });

  it('o limite exato vira elegível assim que passa de 2 anos', async () => {
    const res = await svc.purgeExpiredAuditLogs(new Date(NOW.getTime() + 1), scope.tenant_id);
    expect(res.deleted).toBe(1);
    expect(await auditExists('limite')).toBe(false);
  });

  it('apaga consentimento 5 anos após a revogação; poupa limite, recente, nunca revogado e doador', async () => {
    const res = await svc.purgeExpiredConsents(NOW, scope.tenant_id);

    expect(res).toEqual({ deleted: 1, failed: false });
    expect(await consentExists('revogadoVelho')).toBe(false);
    for (const kept of ['revogadoLimite', 'revogadoRecente', 'nuncaRevogado', 'doadorRevogadoVelho']) {
      expect(await consentExists(kept)).toBe(true);
    }
  });

  it('consentimento é idempotente e o limite exato vira elegível depois', async () => {
    expect(await svc.purgeExpiredConsents(NOW, scope.tenant_id)).toEqual({ deleted: 0, failed: false });
    expect((await svc.purgeExpiredConsents(new Date(NOW.getTime() + 1), scope.tenant_id)).deleted).toBe(1);
  });

  it('não toca outro tenant quando o escopo é passado', async () => {
    const res = await svc.purgeExpiredAuditLogs(NOW, 'tenant-que-nao-existe');
    expect(res.deleted).toBe(0);
  });
});
