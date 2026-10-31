/**
 * Sessão de suporte (`POST /auth/impersonate` → `support_session: true`) nas
 * rotas do Kids (COV-1). O contrato vem do CLAUDE.md do monorepo e do AD-013:
 *
 *   - o `RolesGuard` aceita a sessão de suporte só em GET/HEAD;
 *   - toda requisição que a sessão completa deixa `support_access` em
 *     `audit_logs` (o `AuditInterceptor` grava no sucesso);
 *   - dado de criança (ficha, saúde, roster) não é aberto ao suporte: o recorte
 *     por papel do service continua valendo, e nada de saúde sai na resposta.
 *
 * O token é o que a rota real emite; o suporte nasce no `teste1-church` e abre
 * o `teste2-church` (Premium). Apaga o que criou.
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';
import { ensureRole } from '../helpers/rls';
import { KIDS_TERM_VERSION } from '../../src/kids/consent/kids-consent.terms';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidssup-${ts}`;
const ALERGIA = `amendoim-${ts}`;

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let supportToken: string;
let supportAccountId: string;
let plainSupportToken: string;
let leader: string;
const ids = { celebration: '', i1: '', room: '', session: '', mae: '', child: '', checkin: '' };

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function supportAuditRows(entityPart: string) {
  return admin.auditLog.findMany({
    where: { tenant_id: scope.tenant_id, action: 'support_access', actor_user_id: supportAccountId, entity: { contains: entityPart } },
  });
}
/** A escrita da auditoria é best-effort e sai do pipe: espera por estado, não por tempo. */
async function waitSupportAudit(entityPart: string, atLeast = 1) {
  let rows = await supportAuditRows(entityPart);
  for (let i = 0; i < 40 && rows.length < atLeast; i++) {
    await new Promise((r) => setTimeout(r, 250));
    rows = await supportAuditRows(entityPart);
  }
  return rows;
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-support');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  leader = h.tokenFor('ministry_leader');
  await ensureRole(admin, 'platform_support', 'Platform Support');

  // O suporte mora no teste1; o alvo é o teste2.
  const support = await admin.userAccount.create({
    data: {
      tenant_id: h.t1.tenantId,
      congregation_id: h.t1.congregationId,
      email: `suporte-${ts}@kids-support.fake`,
      password_hash: 'x',
      is_active: true,
    },
  });
  supportAccountId = support.id;
  await admin.roleAssignment.create({
    data: { tenant_id: h.t1.tenantId, congregation_id: h.t1.congregationId, user_account_id: support.id, role_code: 'platform_support' },
  });
  const jwt = h.app.get(JwtService);
  plainSupportToken = jwt.sign({
    sub: support.id,
    email: support.email,
    tenant_id: h.t1.tenantId,
    congregation_id: h.t1.congregationId,
    roles: ['platform_support'],
    plan: 'starter',
  });
  const imp = await http()
    .post('/api/auth/impersonate')
    .set(auth(plainSupportToken))
    .send({ target_tenant_id: h.t2.tenantId });
  expect(imp.status).toBe(200);
  supportToken = imp.body.access_token;
  expect(jwt.decode(supportToken)).toMatchObject({ support_session: true, tenant_id: h.t2.tenantId });

  // Dado de criança que existe de verdade no tenant alvo.
  const mae = await admin.person.create({ data: { ...scope, full_name: `Mae ${tag}`, classification: 'member' } });
  ids.mae = mae.id;
  await admin.consentRecord.create({
    data: { ...scope, person_id: mae.id, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
  });
  const household = await admin.household.create({ data: { ...scope, name: `Família ${tag}` } });
  const birth = new Date();
  birth.setUTCMonth(birth.getUTCMonth() - 36);
  const child = await admin.person.create({
    data: { ...scope, full_name: `Criança ${tag}`, is_child: true, classification: 'attendee', household_id: household.id, birth_date: birth },
  });
  ids.child = child.id;
  await admin.householdMember.createMany({
    data: [
      { household_id: household.id, person_id: mae.id, role: 'head' },
      { household_id: household.id, person_id: child.id, role: 'child' },
    ],
  });
  await admin.kidsGuardian.create({
    data: { ...scope, child_id: child.id, guardian_person_id: mae.id, relationship: 'mãe', can_pickup: true, is_primary: true },
  });
  await admin.kidsChildHealth.create({ data: { ...scope, person_id: child.id, allergies: ALERGIA } });

  ids.celebration = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto kids-support ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 70);
  ids.i1 = (
    await admin.celebrationInstance.create({
      data: { ...scope, celebration_id: ids.celebration, scheduled_date: date, status: 'published' },
    })
  ).id;
  ids.room = (await admin.kidsRoom.create({ data: { ...scope, name: `Maternal ${tag}`, min_age_months: 24, max_age_months: 47 } })).id;
  ids.session = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: ids.i1, room_id: ids.room } })).id;
  ids.checkin = (
    await admin.kidsCheckin.create({
      data: {
        ...scope,
        session_id: ids.session,
        celebration_instance_id: ids.i1,
        child_id: child.id,
        guardian_person_id: mae.id,
        code: 'ABCD',
        checked_in_by: supportAccountId,
      },
    })
  ).id;
}, 120_000);

afterAll(async () => {
  const persons = await admin.person.findMany({ where: { full_name: { endsWith: tag } }, select: { id: true, household_id: true } });
  const personIds = persons.map((p) => p.id);
  const householdIds = persons.map((p) => p.household_id).filter((x): x is string => !!x);
  await admin.auditLog.deleteMany({
    where: { OR: [{ subject_person_id: { in: personIds } }, { actor_user_id: supportAccountId }] },
  });
  await admin.celebration.deleteMany({ where: { id: ids.celebration } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.household.deleteMany({ where: { id: { in: householdIds } } });
  await admin.roleAssignment.deleteMany({ where: { user_account_id: supportAccountId } });
  await admin.userAccount.deleteMany({ where: { id: supportAccountId } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('sessão de suporte nas rotas Kids', () => {
  it('controle: a mesma criança aparece no roster para o líder kids', async () => {
    const res = await http().get(`/api/kids/sessions/${ids.session}/roster`).set(auth(leader));
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ has_allergy: true, allergies: ALERGIA });
  });

  it('sem impersonar, o platform_support leva 403 nas rotas Kids', async () => {
    for (const rota of ['/api/kids/rooms', `/api/kids/sessions/${ids.session}/roster`, `/api/kids/children/${ids.child}`]) {
      expect((await http().get(rota).set(auth(plainSupportToken))).status).toBe(403);
    }
  });

  it('leitura aceita pelo RolesGuard: GET /kids/rooms responde 200 e deixa support_access', async () => {
    const res = await http().get('/api/kids/rooms').set(auth(supportToken));
    expect(res.status).toBe(200);
    expect(res.body.map((r: { id: string }) => r.id)).toContain(ids.room);

    const rows = await waitSupportAudit('/api/kids/rooms');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({ actor_user_id: supportAccountId, congregation_id: scope.congregation_id });
    expect(rows[0].after).toMatchObject({ route: '/api/kids/rooms', method: 'GET', status: 200 });
  }, 30_000);

  it('roster: o guard deixa passar, mas o dado da criança não sai para o suporte', async () => {
    const res = await http().get(`/api/kids/sessions/${ids.session}/roster`).set(auth(supportToken));
    expect(res.status).toBe(403);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(ALERGIA);
    expect(text).not.toContain(`Criança ${tag}`);
  });

  it('ficha da criança: sem leitura de saúde para o suporte e nenhum kids.health_read gravado', async () => {
    const before = await admin.auditLog.count({ where: { action: 'kids.health_read', subject_person_id: ids.child } });
    const res = await http().get(`/api/kids/children/${ids.child}`).set(auth(supportToken));
    expect([403, 404]).toContain(res.status);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(ALERGIA);
    expect(text).not.toContain(`Criança ${tag}`);
    expect(await admin.auditLog.count({ where: { action: 'kids.health_read', subject_person_id: ids.child } })).toBe(before);
  });

  it('check-in: a sessão de suporte é só leitura, o POST é 403 e nada é gravado', async () => {
    const other = await admin.person.create({
      data: {
        ...scope,
        full_name: `Outra ${tag}`,
        is_child: true,
        classification: 'attendee',
        birth_date: (() => {
          const d = new Date();
          d.setUTCMonth(d.getUTCMonth() - 36);
          return d;
        })(),
      },
    });
    await admin.kidsGuardian.create({
      data: { ...scope, child_id: other.id, guardian_person_id: ids.mae, relationship: 'mãe', can_pickup: true, is_primary: true },
    });
    const res = await http()
      .post(`/api/kids/sessions/${ids.session}/checkins`)
      .set(auth(supportToken))
      .send({ child_id: other.id, guardian_person_id: ids.mae });
    expect(res.status).toBe(403);
    expect(await admin.kidsCheckin.count({ where: { child_id: other.id } })).toBe(0);
  });

  it('rota sem recorte no service (criar turma): só o RolesGuard barra o POST da sessão de suporte', async () => {
    const res = await http()
      .post('/api/kids/rooms')
      .set(auth(supportToken))
      .send({ name: `Suporte ${tag}`, min_age_months: 0, max_age_months: 12 });
    expect(res.status).toBe(403);
    expect(await admin.kidsRoom.count({ where: { name: `Suporte ${tag}` } })).toBe(0);
  });

  it('check-out e override também são recusados à sessão de suporte, e o check-in segue aberto', async () => {
    const out = await http()
      .post(`/api/kids/checkins/${ids.checkin}/checkout`)
      .set(auth(supportToken))
      .send({ code: 'ABCD', picked_up_by_person_id: ids.mae });
    expect(out.status).toBe(403);
    const ov = await http()
      .post(`/api/kids/checkins/${ids.checkin}/checkout-override`)
      .set(auth(supportToken))
      .send({ reason: 'teste', picked_up_by_name: 'Fulano' });
    expect(ov.status).toBe(403);
    const row = await admin.kidsCheckin.findUniqueOrThrow({ where: { id: ids.checkin } });
    expect(row.checked_out_at).toBeNull();
  });
});
