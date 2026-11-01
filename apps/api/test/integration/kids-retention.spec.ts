/**
 * Retenção de check-ins kids (KIDS-06) contra o Postgres real: o que o unit
 * não alcança é o filtro de "membro ativo" e o corte de 12 meses valendo de
 * verdade no SQL. Roda só em `teste2-church` (escopo do job restrito a ele) e
 * apaga o que criou.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { KidsRetentionService } from '../../src/kids/retention/kids-retention.service';
import { loadTestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidsret-${ts}`;
const NOW = new Date('2026-10-26T12:00:00.000Z');
const monthsAgo = (m: number, extraMs = 0) => {
  const d = new Date(NOW);
  d.setUTCMonth(d.getUTCMonth() - m);
  return new Date(d.getTime() + extraMs);
};

let prisma: PrismaService;
let svc: KidsRetentionService;
let scope: { tenant_id: string; congregation_id: string };
let accountId: string;
let sessionId: string;
let instanceId: string;
let celebrationId: string;
let roomId: string;
let childId: string;
const guardians: Record<string, string> = {};
const checkins: Record<string, string> = {};
let n = 0;

async function guardian(name: string, data: { classification: 'member' | 'visitor' | 'attendee'; deleted_at?: Date; anonymized_at?: Date }) {
  guardians[name] = (await admin.person.create({ data: { ...scope, full_name: `${name} ${tag}`, ...data } })).id;
}

async function checkin(name: string, guardianKey: string, at: Date) {
  n += 1;
  checkins[name] = (
    await admin.kidsCheckin.create({
      data: {
        ...scope,
        session_id: sessionId,
        celebration_instance_id: instanceId,
        child_id: childId,
        guardian_person_id: guardians[guardianKey]!,
        code: `R${String(n).padStart(3, '0')}`,
        checked_in_at: at,
        checked_in_by: accountId,
        checked_out_at: at,
        checked_out_by: accountId,
        picked_up_by_name: 'Avó Maria',
        picked_up_by_person_id: guardians[guardianKey]!,
        override_reason: 'Responsável esqueceu o código',
      },
    })
  ).id;
}

beforeAll(async () => {
  prisma = new PrismaService();
  svc = new KidsRetentionService(prisma);
  const t2 = await loadTestTenant(admin, 'teste2-church');
  scope = { tenant_id: t2.tenantId, congregation_id: t2.congregationId };
  accountId = (
    await admin.userAccount.create({
      data: { ...scope, email: `${tag}@teste2.fake`, password_hash: 'x', is_active: true },
    })
  ).id;

  await guardian('membro', { classification: 'member' });
  await guardian('exmembro', { classification: 'visitor' });
  await guardian('excluido', { classification: 'member', deleted_at: new Date() });
  await guardian('anonimizado', { classification: 'member', anonymized_at: new Date() });
  childId = (await admin.person.create({ data: { ...scope, full_name: `Crianca ${tag}`, is_child: true, classification: 'attendee' } })).id;

  celebrationId = (
    await admin.celebration.create({ data: { ...scope, name: `Culto ${tag}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' } })
  ).id;
  instanceId = (
    await admin.celebrationInstance.create({
      data: { ...scope, celebration_id: celebrationId, scheduled_date: new Date('2025-01-05T00:00:00Z'), status: 'published' },
    })
  ).id;
  roomId = (await admin.kidsRoom.create({ data: { ...scope, name: `Sala ${tag}`, min_age_months: 0, max_age_months: 60 } })).id;
  sessionId = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instanceId, room_id: roomId } })).id;

  await checkin('exmembroVelho', 'exmembro', monthsAgo(13));
  await checkin('exmembroNoLimite', 'exmembro', monthsAgo(12)); // exatamente 12 meses: ainda no prazo
  await checkin('exmembroUmMsDepois', 'exmembro', monthsAgo(12, -1)); // 1 ms além do prazo
  await checkin('exmembroRecente', 'exmembro', monthsAgo(3));
  await checkin('membroVelho', 'membro', monthsAgo(24));
  await checkin('excluidoVelho', 'excluido', monthsAgo(24));
  await checkin('anonimizadoVelho', 'anonimizado', monthsAgo(24));
}, 120_000);

afterAll(async () => {
  await admin.celebration.deleteMany({ where: { id: celebrationId } });
  await admin.kidsRoom.deleteMany({ where: { id: roomId } });
  await admin.person.deleteMany({ where: { full_name: { endsWith: tag } } });
  await admin.userAccount.deleteMany({ where: { id: accountId } });
  await prisma.$disconnect();
  await admin.$disconnect();
}, 60_000);

const row = (name: string) => admin.kidsCheckin.findUniqueOrThrow({ where: { id: checkins[name]! } });

describe('KidsRetentionService (banco real)', () => {
  it('anonimiza ex-membro/excluído/anonimizado após 12 meses e pula membro ativo, recente e o limite exato', async () => {
    const res = await svc.anonymizeExpiredCheckins(NOW, scope.tenant_id);
    expect(res).toEqual({ anonymized: 4, failed: 0 });

    for (const name of ['exmembroVelho', 'exmembroUmMsDepois', 'excluidoVelho', 'anonimizadoVelho']) {
      const r = await row(name);
      expect(r.anonymized_at).toEqual(NOW);
      expect(r.picked_up_by_name).toBeNull();
      expect(r.picked_up_by_person_id).toBeNull();
      expect(r.override_reason).toBeNull();
      // Contagem e horário preservados.
      expect(r.child_id).toBe(childId);
      expect(r.checked_out_at).not.toBeNull();
    }
    for (const name of ['exmembroNoLimite', 'exmembroRecente', 'membroVelho']) {
      const r = await row(name);
      expect(r.anonymized_at).toBeNull();
      expect(r.picked_up_by_name).toBe('Avó Maria');
      expect(r.override_reason).toBe('Responsável esqueceu o código');
    }
  });

  it('é idempotente: segunda rodada não muda nada nem refaz o carimbo', async () => {
    const res = await svc.anonymizeExpiredCheckins(NOW, scope.tenant_id);
    expect(res).toEqual({ anonymized: 0, failed: 0 });
    expect((await row('exmembroVelho')).anonymized_at).toEqual(NOW);
  });

  it('o limite exato vira elegível assim que passa de 12 meses', async () => {
    const res = await svc.anonymizeExpiredCheckins(new Date(NOW.getTime() + 1), scope.tenant_id);
    expect(res).toEqual({ anonymized: 1, failed: 0 });
    expect((await row('exmembroNoLimite')).anonymized_at).not.toBeNull();
  });

  it('o responsável que deixa de ser membro ativo passa a seguir a regra dos 12 meses', async () => {
    expect((await row('membroVelho')).anonymized_at).toBeNull();
    await admin.person.update({ where: { id: guardians['membro']! }, data: { classification: 'visitor' } });

    const res = await svc.anonymizeExpiredCheckins(NOW, scope.tenant_id);

    expect(res).toEqual({ anonymized: 1, failed: 0 });
    const r = await row('membroVelho');
    expect(r.anonymized_at).toEqual(NOW);
    expect(r.picked_up_by_name).toBeNull();
  });
});
