/**
 * Limite de 5 tentativas de código no check-out do Kids (R3-2, spec P1
 * Check-in/out AC 7b), por HTTP e contra o Postgres com RLS (rotas rodam como
 * `app_user`). O ponto que só o banco prova: o 403 desfaz a transação da
 * requisição, e o contador tem que sobreviver a isso.
 *
 * Roda em `teste2-church` (Premium). Apaga o que criou.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';
import { KIDS_TERM_VERSION } from '../../src/kids/consent/kids-consent.terms';
import { NotificationsService } from '../../src/content/notifications.service';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidslock-${ts}`;
const GENERIC = 'Não foi possível confirmar a retirada. Chame o líder kids.';

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let leader: string;
let leaderAccountId: string;
let mae: string;
let avo: string;
let sessionId: string;
let celebrationId: string;
let pushToPersons: jest.SpyInstance;
const accountIds: string[] = [];

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const checkout = (id: string, body: Record<string, unknown>, token = leader) =>
  http().post(`/api/kids/checkins/${id}/checkout`).set(auth(token)).send(body);
const attempts = async (id: string) =>
  (await admin.kidsCheckin.findUniqueOrThrow({ where: { id }, select: { checkout_failed_attempts: true } })).checkout_failed_attempts;
const auditCount = (checkinId: string, action: string) =>
  admin.auditLog.count({ where: { action, entity: 'kids_checkin', after: { path: ['checkin_id'], equals: checkinId } } });

const denialCount = (checkinId: string, reason: string) =>
  admin.auditLog.count({
    where: {
      action: 'kids.checkout_denied',
      entity: 'kids_checkin',
      AND: [{ after: { path: ['checkin_id'], equals: checkinId } }, { after: { path: ['reason'], equals: reason } }],
    },
  });

let childN = 0;
async function present() {
  childN += 1;
  const household = await admin.household.create({ data: { ...scope, name: `Família ${tag} ${childN}` } });
  const child = await admin.person.create({
    data: {
      ...scope,
      full_name: `Criança ${childN} ${tag}`,
      is_child: true,
      classification: 'attendee',
      household_id: household.id,
      birth_date: new Date(Date.now() - 36 * 30.4 * 86_400_000),
    },
  });
  await admin.householdMember.createMany({
    data: [
      { household_id: household.id, person_id: mae, role: 'head' },
      { household_id: household.id, person_id: child.id, role: 'child' },
    ],
  });
  const g = (p: string, rel: string, can_pickup: boolean, is_primary: boolean) => ({
    ...scope, child_id: child.id, guardian_person_id: p, relationship: rel, can_pickup, is_primary,
  });
  await admin.kidsGuardian.createMany({ data: [g(mae, 'mãe', true, true), g(avo, 'avó', true, false)] });
  const res = await http()
    .post(`/api/kids/sessions/${sessionId}/checkins`)
    .set(auth(leader))
    .send({ child_id: child.id, guardian_person_id: mae });
  expect(res.status).toBe(201);
  return { id: res.body.id as string, code: res.body.code as string, childId: child.id };
}
const wrongCode = (code: string) => (code === 'ZZZZ' ? 'YYYY' : 'ZZZZ');

beforeAll(async () => {
  h = await bootKids(admin, 'kids-lock');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  leader = h.tokenFor('ministry_leader');
  leaderAccountId = (h.app.get(JwtService).decode(leader) as { sub: string }).sub;

  mae = (await admin.person.create({ data: { ...scope, full_name: `Mae ${tag}`, classification: 'member' } })).id;
  avo = (await admin.person.create({ data: { ...scope, full_name: `Avo ${tag}`, classification: 'attendee' } })).id;
  await admin.consentRecord.create({
    data: { ...scope, person_id: mae, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
  });
  celebrationId = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto ${tag}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 90);
  const instance = await admin.celebrationInstance.create({
    data: { ...scope, celebration_id: celebrationId, scheduled_date: date, status: 'published' },
  });
  const room = await admin.kidsRoom.create({ data: { ...scope, name: `Sala ${tag}`, min_age_months: 24, max_age_months: 47 } });
  sessionId = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance.id, room_id: room.id } })).id;
}, 120_000);

beforeEach(() => {
  pushToPersons = jest.spyOn(h.app.get(NotificationsService), 'sendPushToPersons').mockResolvedValue(true);
  jest.spyOn(h.app.get(NotificationsService), 'sendPush').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  const persons = await admin.person.findMany({ where: { full_name: { endsWith: tag } }, select: { id: true, household_id: true } });
  const personIds = persons.map((p) => p.id);
  await admin.auditLog.deleteMany({ where: { OR: [{ subject_person_id: { in: personIds } }, { actor_user_id: leaderAccountId }] } });
  await admin.celebration.deleteMany({ where: { id: celebrationId } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.household.deleteMany({ where: { id: { in: persons.map((p) => p.household_id).filter((x): x is string => !!x) } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('limite de 5 tentativas de código no check-out (R3-2)', () => {
  it('o contador SOBREVIVE ao 403 (que desfaz a transação da requisição): 3 erros = 3 no banco', async () => {
    const c = await present();
    for (let i = 1; i <= 3; i++) {
      const res = await checkout(c.id, { code: wrongCode(c.code), picked_up_by_person_id: mae });
      expect(res.status).toBe(403);
      expect(await attempts(c.id)).toBe(i);
    }
  });

  it('4 falhas e depois o código certo: fecha normalmente', async () => {
    const c = await present();
    for (let i = 0; i < 4; i++) expect((await checkout(c.id, { code: wrongCode(c.code), picked_up_by_person_id: mae })).status).toBe(403);
    const ok = await checkout(c.id, { code: c.code, picked_up_by_person_id: mae });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ id: c.id, picked_up_by_person_id: mae });
    expect(await auditCount(c.id, 'kids.checkout_locked')).toBe(0);
  });

  it('5 falhas e depois o código CERTO: o mesmo 403 genérico, check-in segue aberto, uma única auditoria de travamento', async () => {
    const c = await present();
    const bodies: unknown[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await checkout(c.id, { code: wrongCode(c.code), picked_up_by_person_id: mae });
      expect(res.status).toBe(403);
      bodies.push(res.body);
    }
    const after = await checkout(c.id, { code: c.code, picked_up_by_person_id: mae });
    const afterAvo = await checkout(c.id, { code: c.code, picked_up_by_person_id: avo });

    for (const res of [after, afterAvo]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(bodies[0]); // idêntico à recusa comum: não revela o travamento
      expect(res.body.message).toBe(GENERIC);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    const row = await admin.kidsCheckin.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.checked_out_at).toBeNull();
    expect(row.checkout_failed_attempts).toBe(5); // travado não acumula
    expect(await auditCount(c.id, 'kids.checkout_locked')).toBe(1);
    expect(await auditCount(c.id, 'kids.checkout_denied')).toBeGreaterThanOrEqual(5);
  });

  it('avisa o líder: um push de recusa nas 4 primeiras e o do travamento na 5ª', async () => {
    const c = await present();
    for (let i = 0; i < 5; i++) await checkout(c.id, { code: wrongCode(c.code), picked_up_by_person_id: mae });
    const types = pushToPersons.mock.calls.map(([opts]) => opts.data.type);
    expect(types.filter((t) => t === 'kids_checkout_denied')).toHaveLength(4);
    expect(types.filter((t) => t === 'kids_checkout_locked')).toHaveLength(1);
    const lockedPush = pushToPersons.mock.calls.find(([opts]) => opts.data.type === 'kids_checkout_locked')![0];
    expect(JSON.stringify(lockedPush)).not.toMatch(/Criança \d/); // sem nome de criança
    expect(lockedPush.data).toEqual({ type: 'kids_checkout_locked', session_id: sessionId, checkin_id: c.id }); // FIX3: contrato exato
  });

  it('o checkout-override do líder continua encerrando um check-in travado', async () => {
    const c = await present();
    for (let i = 0; i < 5; i++) await checkout(c.id, { code: wrongCode(c.code), picked_up_by_person_id: mae });
    const res = await http()
      .post(`/api/kids/checkins/${c.id}/checkout-override`)
      .set(auth(leader))
      .send({ reason: 'Conferi o documento da mãe no balcão', picked_up_by_name: `Mae ${tag}` });
    expect(res.status).toBe(200);
    const row = await admin.kidsCheckin.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.checked_out_at).not.toBeNull();
    expect(row.override_reason).toBe('Conferi o documento da mãe no balcão');
  });

  // Causa do flaky (FIX4): com o contador em 5 a tentativa SEGUINTE é recusada como
  // 'locked' SEM contar (design R3-2). Das 8 simultâneas, as que leem o check-in depois
  // do 5º commit caem nesse ramo — quantas, depende da carga. Cravar `attempts === 8`
  // era cravar o agendamento, não a correção. O que é correção, e vale sempre: nenhuma
  // atualização perdida (cada recusa contada tem a sua auditoria e soma exatamente no
  // contador), toda requisição é contada OU recusada como 'locked' (8 no total), o
  // contador chega a >= 5 e exatamente UMA auditoria de travamento.
  it('contador atômico: 8 erros simultâneos — nenhuma perda, contadas + travadas = 8 e só UM trava', async () => {
    const c = await present();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => checkout(c.id, { code: wrongCode(c.code), picked_up_by_person_id: mae })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(403));
    const counted = await denialCount(c.id, 'code_mismatch');
    const lockedDenials = await denialCount(c.id, 'locked');
    expect(await attempts(c.id)).toBe(counted); // o UPDATE +1 não perdeu nenhuma
    expect(counted + lockedDenials).toBe(8);
    expect(counted).toBeGreaterThanOrEqual(5);
    expect(await auditCount(c.id, 'kids.checkout_locked')).toBe(1);
  });

  it('contador atômico: exatamente 5 erros simultâneos somam 5 (todas contadas) e só UM trava', async () => {
    const c = await present();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => checkout(c.id, { code: wrongCode(c.code), picked_up_by_person_id: mae })),
    );
    expect(results.map((r) => r.status)).toEqual(Array(5).fill(403));
    expect(await attempts(c.id)).toBe(5); // nenhuma lê >= 5 antes da última: nada cai no ramo 'locked'
    expect(await denialCount(c.id, 'locked')).toBe(0);
    expect(await auditCount(c.id, 'kids.checkout_locked')).toBe(1);
  });

  it('o contador é por check-in: travar um não afeta o das outras crianças', async () => {
    const a = await present();
    const b = await present();
    for (let i = 0; i < 5; i++) await checkout(a.id, { code: wrongCode(a.code), picked_up_by_person_id: mae });
    expect((await checkout(b.id, { code: b.code, picked_up_by_person_id: mae })).status).toBe(200);
    expect(await attempts(b.id)).toBe(0);
  });

  it('código certo com pessoa sem can_pickup é recusa mas não gasta tentativa', async () => {
    const c = await present();
    const stranger = await admin.person.create({ data: { ...scope, full_name: `Estranho ${tag}`, classification: 'visitor' } });
    for (let i = 0; i < 6; i++) {
      expect((await checkout(c.id, { code: c.code, picked_up_by_person_id: stranger.id })).status).toBe(403);
    }
    expect(await attempts(c.id)).toBe(0);
    expect((await checkout(c.id, { code: c.code, picked_up_by_person_id: mae })).status).toBe(200);
  });

  it('a função do contador não é chamável pelo papel das requisições (app_user) nem fora do escopo do check-in', async () => {
    const c = await present();
    const priv = await admin.$queryRaw<{ app_user: boolean; orbien_app: boolean }[]>`
      SELECT has_function_privilege('app_user', 'kids_register_checkout_failure(text,text,text)', 'EXECUTE') AS app_user,
             has_function_privilege('orbien_app', 'kids_register_checkout_failure(text,text,text)', 'EXECUTE') AS orbien_app`;
    expect(priv[0]).toEqual({ app_user: false, orbien_app: true });
    const wrongScope = await admin.$queryRaw<{ n: number | null }[]>`
      SELECT kids_register_checkout_failure(${c.id}, ${scope.tenant_id}, 'outra-congregacao') AS n`;
    expect(wrongScope[0]!.n).toBeNull();
    expect(await attempts(c.id)).toBe(0);
  });
});
