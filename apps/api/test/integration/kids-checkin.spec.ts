/**
 * Check-in, check-out e roster do Kids por HTTP (spec "Check-in e check-out
 * seguros", AC 1 a 9 e Edge Cases), contra o Postgres com RLS: as rotas rodam
 * como `app_user`, então o que passa aqui passa com o RLS ligado.
 *
 * Roda em `teste2-church` (Premium); `teste1-church` entra só como "outro
 * tenant". Apaga o que criou.
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
const tag = `kidsci-${ts}`;
const ALERGIA = `amendoim-${ts}`;
const NOTA = `bombinha-${ts}`;
const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/;
const GHOST = '00000000-0000-4000-8000-000000000000';
const GENERIC = 'Não foi possível confirmar a retirada. Chame o líder kids.';

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let leader: string;
let tokenMae: string;
let tokenOutra: string;
let tokenVol: string;
let tokenVolFora: string;
let accountMae: string;
let accountVol: string;
let leaderAccountId: string;
const accountIds: string[] = [];
const ids = { celebration: '', i1: '', i2: '', sMat: '', sBebe: '', sEstrito: '', sCancel: '', sCap: '', roomCap: '' };
let mae: string;
let avo: string;
let tio: string;
let outraMae: string;

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const monthsAgo = (m: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - m);
  d.setUTCDate(d.getUTCDate() - 3); // folga: nunca cai no limite do mês
  return d;
};
const checkinUrl = (sessionId: string) => `/api/kids/sessions/${sessionId}/checkins`;
const checkIn = (token: string, sessionId: string, body: Record<string, unknown>) =>
  http().post(checkinUrl(sessionId)).set(auth(token)).send(body);

let dayOffset = 0;
async function newInstance(status: 'published' | 'cancelled' = 'published') {
  dayOffset += 1;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 60 + dayOffset);
  return admin.celebrationInstance.create({
    data: { ...scope, celebration_id: ids.celebration, scheduled_date: date, status },
  });
}

async function mkUser(label: string, roles: string[]) {
  const person = await admin.person.create({ data: { ...scope, full_name: `${label} ${tag}`, classification: 'member' } });
  const account = await admin.userAccount.create({
    data: { ...scope, person_id: person.id, email: `${label}-${ts}@kids-checkin.fake`, password_hash: 'x', is_active: true },
  });
  accountIds.push(account.id);
  const token = h.app.get(JwtService).sign({
    sub: account.id,
    email: account.email,
    tenant_id: scope.tenant_id,
    congregation_id: scope.congregation_id,
    roles,
    plan: 'premium',
  });
  return { personId: person.id, accountId: account.id, token };
}

let childN = 0;
/** Criança com Household da `mae`, mãe como primária, avó (retira) e tio (não retira). */
async function mkChild(opts: { months?: number | null; allergy?: string | null; consent?: boolean; label?: string } = {}) {
  childN += 1;
  const months = opts.months === undefined ? 36 : opts.months;
  const household = await admin.household.create({ data: { ...scope, name: `Família ${tag} ${childN}` } });
  const child = await admin.person.create({
    data: {
      ...scope,
      full_name: `${opts.label ?? 'Criança'} ${childN} ${tag}`,
      is_child: true,
      classification: 'attendee',
      household_id: household.id,
      birth_date: months === null ? null : monthsAgo(months),
    },
  });
  await admin.householdMember.createMany({
    data: [
      { household_id: household.id, person_id: mae, role: 'head' },
      { household_id: household.id, person_id: child.id, role: 'child' },
    ],
  });
  const g = (guardian: string, rel: string, can_pickup: boolean, is_primary: boolean) => ({
    ...scope,
    child_id: child.id,
    guardian_person_id: guardian,
    relationship: rel,
    can_pickup,
    is_primary,
  });
  await admin.kidsGuardian.createMany({
    data: [g(mae, 'mãe', true, true), g(avo, 'avó', true, false), g(tio, 'tio', false, false)],
  });
  if (opts.allergy !== null) {
    await admin.kidsChildHealth.create({
      data: { ...scope, person_id: child.id, allergies: opts.allergy ?? ALERGIA, medical_notes: NOTA },
    });
  }
  return child.id;
}

async function openCount(childId: string) {
  return admin.kidsCheckin.count({ where: { child_id: childId, checked_out_at: null } });
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-checkin');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  leader = h.tokenFor('ministry_leader');
  leaderAccountId = (h.app.get(JwtService).decode(leader) as { sub: string }).sub;

  const m = await mkUser('Mae', ['member']);
  mae = m.personId;
  tokenMae = m.token;
  accountMae = m.accountId;
  const o = await mkUser('OutraMae', ['member']);
  outraMae = o.personId;
  tokenOutra = o.token;
  const vol = await mkUser('Voluntaria', ['volunteer']);
  tokenVol = vol.token;
  accountVol = vol.accountId;
  tokenVolFora = (await mkUser('VoluntariaFora', ['volunteer'])).token;
  avo = (await admin.person.create({ data: { ...scope, full_name: `Avó ${tag}`, classification: 'attendee' } })).id;
  tio = (await admin.person.create({ data: { ...scope, full_name: `Tio ${tag}`, classification: 'attendee' } })).id;

  // Consentimento vigente da mãe (a outra mãe não precisa).
  await admin.consentRecord.create({
    data: { ...scope, person_id: mae, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
  });

  ids.celebration = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto kids-checkin ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  const i1 = await newInstance();
  const i2 = await newInstance();
  const i3 = await newInstance('cancelled');
  ids.i1 = i1.id;
  ids.i2 = i2.id;

  const room = (name: string, min: number, max: number, extra: Record<string, unknown> = {}) =>
    admin.kidsRoom.create({ data: { ...scope, name: `${name} ${tag}`, min_age_months: min, max_age_months: max, ...extra } });
  const rMat = await room('Maternal', 24, 47);
  const rBebe = await room('Bebês', 0, 11, { allows_out_of_range: true });
  const rEstrito = await room('Júnior', 100, 119, { allows_out_of_range: false });
  const rCap = await room('Pequenos', 0, 200, { capacity: 1 });
  ids.roomCap = rCap.id;
  const sess = (instance: string, roomId: string, status: 'open' | 'cancelled' = 'open') =>
    admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance, room_id: roomId, status } });
  ids.sMat = (await sess(i1.id, rMat.id)).id;
  ids.sBebe = (await sess(i1.id, rBebe.id)).id;
  ids.sEstrito = (await sess(i2.id, rEstrito.id)).id;
  ids.sCap = (await sess(i2.id, rCap.id)).id;
  ids.sCancel = (await sess(i3.id, rMat.id, 'cancelled')).id;

  // A voluntária está escalada só na sessão Maternal (CelebrationMinistry.kids_session_id).
  const profile = await admin.volunteerProfile.create({
    data: { ...scope, person_id: vol.personId, availability: {}, skills: [] },
  });
  const ministry = await admin.ministry.create({ data: { ...scope, name: `Kids ${tag}` } });
  const schedule = await admin.celebrationSchedule.create({
    data: { ...scope, celebration_instance_id: i1.id },
  });
  const cm = await admin.celebrationMinistry.create({
    data: { ...scope, schedule_id: schedule.id, ministry_id: ministry.id, kids_session_id: ids.sMat },
  });
  await admin.celebrationAssignment.create({
    data: { ...scope, celebration_ministry_id: cm.id, volunteer_profile_id: profile.id, status: 'confirmed' },
  });
}, 120_000);

afterAll(async () => {
  const persons = await admin.person.findMany({ where: { full_name: { endsWith: tag } }, select: { id: true, household_id: true } });
  const personIds = persons.map((p) => p.id);
  const householdIds = persons.map((p) => p.household_id).filter((x): x is string => !!x);
  await admin.auditLog.deleteMany({ where: { OR: [{ subject_person_id: { in: personIds } }, { actor_user_id: { in: [leaderAccountId, ...accountIds] } }] } });
  // Sessões, check-ins e escala saem em cascata com a celebração e as turmas.
  await admin.celebration.deleteMany({ where: { id: ids.celebration } });
  await admin.celebrationMinistry.deleteMany({ where: { ministry: { name: `Kids ${tag}` } } });
  await admin.ministry.deleteMany({ where: { name: `Kids ${tag}` } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.household.deleteMany({ where: { id: { in: householdIds } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('POST /kids/sessions/:id/checkins', () => {
  it('AC 1: a equipe recebe a criança: código de 4 caracteres, quem entrega, quem recebe e a instância da sessão', async () => {
    const child = await mkChild();
    const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(CODE);
    expect(res.body).toMatchObject({ session_id: ids.sMat, child_id: child, guardian_person_id: mae, age_override: false, capacity_warning: null });
    // Saúde só viaja na etiqueta da criança (AC 5), nunca nos campos do check-in.
    const { labels: _labels, ...checkinFields } = res.body;
    expect(JSON.stringify(checkinFields)).not.toContain(ALERGIA);

    const row = await admin.kidsCheckin.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({
      session_id: ids.sMat,
      celebration_instance_id: ids.i1,
      child_id: child,
      guardian_person_id: mae,
      checked_in_by: leaderAccountId,
      code: res.body.code,
      checked_out_at: null,
    });
  });

  it('AC 1b: 400 sem responsável que entrega, sem criança, com UUID inválido ou com campo que o servidor decide', async () => {
    const child = await mkChild();
    const bad = [
      { child_id: child },
      { guardian_person_id: mae },
      { child_id: 'x', guardian_person_id: mae },
      { child_id: child, guardian_person_id: mae, checked_in_by: 'fulano' },
      { child_id: child, guardian_person_id: mae, code: 'AAAA' },
    ];
    for (const body of bad) expect((await checkIn(leader, ids.sMat, body)).status).toBe(400);
    expect(await openCount(child)).toBe(0);
  });

  it('422 quando quem entrega não é responsável nem autorizado desta criança', async () => {
    const child = await mkChild();
    const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: outraMae });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('kids_guardian_not_authorized');
  });

  it('terceiro autorizado entrega (mesmo sem poder de retirar)', async () => {
    const child = await mkChild();
    expect((await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: tio })).status).toBe(201);
  });

  it('AC 2: 409 com a criança já presente na mesma sessão e em outra turma da mesma instância', async () => {
    const child = await mkChild();
    expect((await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae })).status).toBe(201);

    const same = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    const other = await checkIn(leader, ids.sBebe, { child_id: child, guardian_person_id: mae, confirm_out_of_range: true });

    expect(same.status).toBe(409);
    expect(other.status).toBe(409);
    expect(await openCount(child)).toBe(1);
  });

  it('depois do check-out a criança pode entrar de novo (outra turma do mesmo culto)', async () => {
    const child = await mkChild({ months: 6 });
    const first = await checkIn(leader, ids.sBebe, { child_id: child, guardian_person_id: mae });
    expect(first.status).toBe(201);
    const out = await http()
      .post(`/api/kids/checkins/${first.body.id}/checkout`)
      .set(auth(leader))
      .send({ code: first.body.code, picked_up_by_person_id: mae });
    expect(out.status).toBe(200);

    expect((await checkIn(leader, ids.sBebe, { child_id: child, guardian_person_id: mae })).status).toBe(201);
  });

  it('concorrência: dois check-ins simultâneos da mesma criança dão um 201 e um 409, sem 500', async () => {
    for (let round = 0; round < 3; round++) {
      const child = await mkChild();
      const send = () => checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
      const results = await Promise.all([send(), send()]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await openCount(child)).toBe(1);
    }
  });

  it('concorrência: duas CRIANÇAS diferentes ao mesmo tempo ganham códigos distintos na sessão', async () => {
    const [a, b, c, d] = await Promise.all([mkChild(), mkChild(), mkChild(), mkChild()]);
    const results = await Promise.all(
      [a, b, c, d].map((child) => checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae })),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(results.map((r) => r.body.code)).size).toBe(4);
  });

  describe('faixa etária (AC 3 e 3b)', () => {
    it('3b: turma que não aceita fora da faixa: 422 "fora da faixa etária da turma", mesmo com confirmação', async () => {
      const child = await mkChild({ months: 36 }); // Júnior é 100-119
      for (const confirm of [false, true]) {
        const res = await checkIn(leader, ids.sEstrito, { child_id: child, guardian_person_id: mae, confirm_out_of_range: confirm });
        expect(res.status).toBe(422);
        expect(res.body.message).toBe('Criança fora da faixa etária da turma');
        expect(res.body).toMatchObject({ code: 'kids_out_of_range', age_months: 36 });
      }
      expect(await openCount(child)).toBe(0);
    });

    it('3: turma que aceita: sem confirmação pede (OUT_OF_RANGE_CONFIRM com idade e faixa); confirmado grava age_override', async () => {
      const child = await mkChild({ months: 36 }); // Bebês é 0-11 e aceita fora
      const ask = await checkIn(leader, ids.sBebe, { child_id: child, guardian_person_id: mae });
      expect(ask.status).toBe(422);
      expect(ask.body).toMatchObject({
        code: 'OUT_OF_RANGE_CONFIRM',
        requires_confirmation: true,
        age_months: 36,
        min_age_months: 0,
        max_age_months: 11,
      });
      expect(await openCount(child)).toBe(0);

      const ok = await checkIn(leader, ids.sBebe, { child_id: child, guardian_person_id: mae, confirm_out_of_range: true });
      expect(ok.status).toBe(201);
      expect(ok.body.age_override).toBe(true);
      expect((await admin.kidsCheckin.findUniqueOrThrow({ where: { id: ok.body.id } })).age_override).toBe(true);
    });

    it('criança sem data de nascimento: 422 pedindo a data', async () => {
      const child = await mkChild({ months: null });
      const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('kids_birth_date_required');
    });
  });

  it('AC 4: capacidade só avisa; o check-in acima dela segue sendo gravado', async () => {
    const first = await checkIn(leader, ids.sCap, { child_id: await mkChild(), guardian_person_id: mae });
    const second = await checkIn(leader, ids.sCap, { child_id: await mkChild(), guardian_person_id: mae });

    expect(first.status).toBe(201);
    expect(first.body.capacity_warning).toEqual({ capacity: 1, present: 1 });
    expect(second.status).toBe(201);
    expect(second.body.capacity_warning).toEqual({ capacity: 1, present: 2 });
  });

  it('422 sem consentimento vigente do responsável (revogado) e volta a passar ao consentir de novo', async () => {
    const child = await mkChild();
    await admin.consentRecord.updateMany({ where: { person_id: mae, origin: 'kids' }, data: { revoked_at: new Date() } });
    try {
      const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'kids_consent_required', term_version: KIDS_TERM_VERSION });
      expect(await openCount(child)).toBe(0);
    } finally {
      await admin.consentRecord.updateMany({ where: { person_id: mae, origin: 'kids' }, data: { revoked_at: null } });
    }
    expect((await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae })).status).toBe(201);
  });

  it('422 em sessão cancelada', async () => {
    const res = await checkIn(leader, ids.sCancel, { child_id: await mkChild(), guardian_person_id: mae });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('kids_session_cancelled');
  });

  it('404 em sessão ou criança inexistente; 400 com id de sessão que não é UUID', async () => {
    const child = await mkChild();
    expect((await checkIn(leader, GHOST, { child_id: child, guardian_person_id: mae })).status).toBe(404);
    expect((await checkIn(leader, ids.sMat, { child_id: GHOST, guardian_person_id: mae })).status).toBe(404);
    expect((await http().post('/api/kids/sessions/x/checkins').set(auth(leader)).send({ child_id: child, guardian_person_id: mae })).status).toBe(400);
  });

  describe('quem pode', () => {
    it('401 sem token; 403 para plano Starter e para papéis fora da lista', async () => {
      const child = await mkChild();
      const body = { child_id: child, guardian_person_id: mae };
      expect((await http().post(checkinUrl(ids.sMat)).send(body)).status).toBe(401);
      expect((await checkIn(h.tokenT1('starter', 'ministry_leader'), ids.sMat, body)).status).toBe(403);
      expect((await checkIn(h.tokenFor('visitor'), ids.sMat, body)).status).toBe(403);
      expect((await checkIn(h.tokenFor('cell_leader'), ids.sMat, body)).status).toBe(403);
      expect(await openCount(child)).toBe(0);
    });

    it('voluntário escalado naquela sessão recebe a criança; em outra sessão ou sem escala leva 403 (AC 9)', async () => {
      const ok = await checkIn(tokenVol, ids.sMat, { child_id: await mkChild(), guardian_person_id: mae });
      expect(ok.status).toBe(201);
      expect(ok.body.checked_in_by).toBe(accountVol);

      const child = await mkChild({ months: 6 });
      expect((await checkIn(tokenVol, ids.sBebe, { child_id: child, guardian_person_id: mae })).status).toBe(403);
      expect((await checkIn(tokenVolFora, ids.sMat, { child_id: child, guardian_person_id: mae })).status).toBe(403);
      expect(await openCount(child)).toBe(0);
    });

    it('o responsável faz o check-in do PRÓPRIO filho pelo app, entregando como ele mesmo', async () => {
      const child = await mkChild();
      const res = await checkIn(tokenMae, ids.sMat, { child_id: child, guardian_person_id: mae });
      expect(res.status).toBe(201);
      expect(res.body.checked_in_by).toBe(accountMae);
    });

    it('o responsável não faz check-in de filho de outra família (404) nem entrega "como" outra pessoa (403)', async () => {
      const child = await mkChild();
      expect((await checkIn(tokenOutra, ids.sMat, { child_id: child, guardian_person_id: outraMae })).status).toBe(404);
      expect((await checkIn(tokenMae, ids.sMat, { child_id: child, guardian_person_id: avo })).status).toBe(403);
      expect(await openCount(child)).toBe(0);
    });

    it('RLS: sessão de outro tenant não existe para quem tem o token do teste1 (404)', async () => {
      const child = await mkChild();
      const res = await checkIn(h.tokenT1('premium', 'ministry_leader'), ids.sMat, { child_id: child, guardian_person_id: mae });
      expect(res.status).toBe(404);
    });
  });
});

describe('POST /kids/checkins/:id/checkout', () => {
  async function present(opts: Parameters<typeof mkChild>[0] = {}) {
    const child = await mkChild(opts);
    const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    expect(res.status).toBe(201);
    return { child, id: res.body.id as string, code: res.body.code as string };
  }
  const out = (token: string, id: string, body: Record<string, unknown>) =>
    http().post(`/api/kids/checkins/${id}/checkout`).set(auth(token)).send(body);
  const denials = (child: string) =>
    admin.auditLog.count({ where: { subject_person_id: child, action: 'kids.checkout_denied' } });

  it('AC 6: código certo e responsável com can_pickup fecha o check-in com horário e quem retirou', async () => {
    const p = await present();
    const res = await out(leader, p.id, { code: p.code, picked_up_by_person_id: mae });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: p.id, picked_up_by_person_id: mae, checked_out_by: leaderAccountId });
    const row = await admin.kidsCheckin.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.checked_out_at).not.toBeNull();
    expect(row).toMatchObject({ picked_up_by_person_id: mae, checked_out_by: leaderAccountId, override_reason: null });
    expect(await denials(p.child)).toBe(0);
  });

  it('o código vale em minúsculas e a avó (terceiro autorizado) retira pelo nome', async () => {
    const p = await present();
    const res = await out(leader, p.id, { code: p.code.toLowerCase(), picked_up_by_name: `  avó ${tag.toUpperCase()}` });
    expect(res.status).toBe(200);
    expect(res.body.picked_up_by_person_id).toBe(avo);
  });

  it('check-in fechado não reabre nem fecha de novo (409), e a criança já pode entrar de novo', async () => {
    const p = await present();
    expect((await out(leader, p.id, { code: p.code, picked_up_by_person_id: mae })).status).toBe(200);
    const again = await out(leader, p.id, { code: p.code, picked_up_by_person_id: mae });
    expect(again.status).toBe(409);
    expect((await admin.kidsCheckin.findUniqueOrThrow({ where: { id: p.id } })).checked_out_at).not.toBeNull();
    expect(await openCount(p.child)).toBe(0);
  });

  it('dois check-outs simultâneos: um 200 e um 409', async () => {
    const p = await present();
    const send = () => out(leader, p.id, { code: p.code, picked_up_by_person_id: mae });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  describe('AC 7: recusa genérica, auditada, sem revelar o motivo', () => {
    it('código errado e pessoa sem can_pickup (tio) com código certo dão o MESMO 403', async () => {
      const p = await present();
      const wrongCode = await out(leader, p.id, { code: p.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ', picked_up_by_person_id: mae });
      const noPickup = await out(leader, p.id, { code: p.code, picked_up_by_person_id: tio });
      const stranger = await out(leader, p.id, { code: p.code, picked_up_by_person_id: outraMae });

      for (const r of [wrongCode, noPickup, stranger]) {
        expect(r.status).toBe(403);
        expect(r.body.message).toBe(GENERIC);
      }
      expect(noPickup.body).toEqual(wrongCode.body);
      expect(stranger.body).toEqual(wrongCode.body);
      expect(await openCount(p.child)).toBe(1); // continua presente
    });

    it('código de OUTRA criança não retira esta', async () => {
      const a = await present();
      const b = await present();
      const res = await out(leader, a.id, { code: b.code, picked_up_by_person_id: mae });
      // códigos são únicos na sessão, então o de B nunca é o de A
      expect(res.status).toBe(403);
      expect(await openCount(a.child)).toBe(1);
    });

    it('grava auditoria de cada recusa, sem dado de saúde nem o código digitado', async () => {
      const p = await present();
      await out(leader, p.id, { code: 'QQQQ', picked_up_by_person_id: mae });
      await out(leader, p.id, { code: p.code, picked_up_by_person_id: tio });

      const rows = await admin.auditLog.findMany({ where: { subject_person_id: p.child, action: 'kids.checkout_denied' } });
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.entity === 'kids_checkin' && r.actor_user_id === leaderAccountId)).toBe(true);
      const dump = JSON.stringify(rows);
      expect(dump).not.toContain(ALERGIA);
      expect(dump).not.toContain(NOTA);
      expect(dump).not.toContain('QQQQ');
      expect(dump).not.toContain(p.code);
    });
  });

  it('400 sem dizer quem retira; 404 e 400 de id; sem código', async () => {
    const p = await present();
    expect((await out(leader, p.id, { code: p.code })).status).toBe(400);
    expect((await out(leader, p.id, { picked_up_by_person_id: mae })).status).toBe(400);
    expect((await out(leader, GHOST, { code: 'AAAA', picked_up_by_person_id: mae })).status).toBe(404);
    expect((await http().post('/api/kids/checkins/x/checkout').set(auth(leader)).send({ code: 'AAAA' })).status).toBe(400);
  });

  it('quem pode: voluntário escalado fecha; voluntário fora da sessão, responsável e visitante levam 403; 401 sem token; Starter 403', async () => {
    const p = await present();
    const body = { code: p.code, picked_up_by_person_id: mae };
    expect((await out(tokenVolFora, p.id, body)).status).toBe(403);
    expect((await out(tokenMae, p.id, body)).status).toBe(403);
    expect((await out(h.tokenFor('visitor'), p.id, body)).status).toBe(403);
    expect((await out(h.tokenT1('starter', 'ministry_leader'), p.id, body)).status).toBe(403);
    expect((await http().post(`/api/kids/checkins/${p.id}/checkout`).send(body)).status).toBe(401);
    expect(await openCount(p.child)).toBe(1);

    expect((await out(tokenVol, p.id, body)).status).toBe(200);
  });

  it('RLS: o check-in de outra congregação/tenant não é visível (404)', async () => {
    const p = await present();
    const res = await out(h.tokenT1('premium', 'ministry_leader'), p.id, { code: p.code, picked_up_by_person_id: mae });
    expect(res.status).toBe(404);
  });
});

describe('POST /kids/checkins/:id/checkout-override', () => {
  async function present() {
    const child = await mkChild();
    const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    return { child, id: res.body.id as string, code: res.body.code as string };
  }
  const override = (token: string, id: string, body: Record<string, unknown>) =>
    http().post(`/api/kids/checkins/${id}/checkout-override`).set(auth(token)).send(body);
  const body = { reason: 'Perdeu a etiqueta; conferi o RG', picked_up_by_name: 'Maria Souza' };

  it('AC 8: o líder kids fecha por exceção com motivo; grava motivo, quem retirou e a auditoria', async () => {
    const p = await present();
    const res = await override(leader, p.id, body);

    expect(res.status).toBe(200);
    const row = await admin.kidsCheckin.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({
      override_reason: body.reason,
      picked_up_by_name: body.picked_up_by_name,
      checked_out_by: leaderAccountId,
    });
    expect(row.checked_out_at).not.toBeNull();
    const audit = await admin.auditLog.findMany({ where: { subject_person_id: p.child, action: 'kids.checkout_override' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ entity: 'kids_checkin', actor_user_id: leaderAccountId });
    expect(JSON.stringify(audit)).not.toContain(ALERGIA);
  });

  it('AC 8: 400 sem motivo, com motivo em branco, sem nome de quem retira', async () => {
    const p = await present();
    expect((await override(leader, p.id, { picked_up_by_name: 'Maria' })).status).toBe(400);
    expect((await override(leader, p.id, { reason: '      ', picked_up_by_name: 'Maria' })).status).toBe(400);
    expect((await override(leader, p.id, { reason: 'Perdeu a etiqueta' })).status).toBe(400);
    expect(await openCount(p.child)).toBe(1);
  });

  it('403 para voluntário (mesmo escalado), responsável e visitante; só a gestão autoriza exceção', async () => {
    const p = await present();
    for (const t of [tokenVol, tokenMae, h.tokenFor('visitor')]) expect((await override(t, p.id, body)).status).toBe(403);
    expect(await openCount(p.child)).toBe(1);
    expect((await override(h.tokenFor('pastor'), p.id, body)).status).toBe(200);
  });

  it('409 se já estiver fechado; 404 se não existir', async () => {
    const p = await present();
    expect((await override(leader, p.id, body)).status).toBe(200);
    expect((await override(leader, p.id, body)).status).toBe(409);
    expect((await override(leader, GHOST, body)).status).toBe(404);
  });
});

describe('GET /kids/sessions/:id/roster', () => {
  const roster = (token: string, sessionId: string) => http().get(`/api/kids/sessions/${sessionId}/roster`).set(auth(token));

  it('lista os presentes com a alergia em destaque e audita a leitura de saúde sem gravar o conteúdo', async () => {
    const session = ids.sEstrito;
    const a = await mkChild({ months: 110, allergy: ALERGIA, label: 'Alérgica' });
    const b = await mkChild({ months: 110, allergy: null, label: 'Sem' });
    const ra = await checkIn(leader, session, { child_id: a, guardian_person_id: mae });
    const rb = await checkIn(leader, session, { child_id: b, guardian_person_id: avo });
    expect([ra.status, rb.status]).toEqual([201, 201]);

    const res = await roster(leader, session);

    expect(res.status).toBe(200);
    expect(res.body.present_count).toBeGreaterThanOrEqual(2);
    const byChild = (id: string) => res.body.items.find((i: { child: { id: string } }) => i.child.id === id);
    expect(byChild(a)).toMatchObject({
      checkin_id: ra.body.id,
      has_allergy: true,
      allergies: ALERGIA,
      guardian: { person_id: mae },
    });
    expect(byChild(b)).toMatchObject({ has_allergy: false, allergies: null, guardian: { person_id: avo } });
    expect(JSON.stringify(res.body)).not.toContain(NOTA);
    // O código não sai no roster: a equipe o viu no check-in e não o relê.
    expect(byChild(a)).not.toHaveProperty('code');
    expect(JSON.stringify(res.body)).not.toContain(ra.body.code);

    const audit = await admin.auditLog.findMany({ where: { subject_person_id: a, action: 'kids.health_read', actor_user_id: leaderAccountId } });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(audit)).not.toContain(ALERGIA);
    expect(JSON.stringify(audit)).not.toContain(NOTA);
  });

  it('quem saiu não aparece; sessão sem ninguém devolve lista vazia', async () => {
    const child = await mkChild({ months: 110 });
    const inn = await checkIn(leader, ids.sEstrito, { child_id: child, guardian_person_id: mae });
    await http().post(`/api/kids/checkins/${inn.body.id}/checkout`).set(auth(leader)).send({ code: inn.body.code, picked_up_by_person_id: mae });

    const res = await roster(leader, ids.sEstrito);
    expect(res.body.items.some((i: { child: { id: string } }) => i.child.id === child)).toBe(false);

    const empty = await roster(leader, ids.sCancel);
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ present_count: 0, items: [] });
  });

  it('AC 9: gestão e voluntário escalado leem; voluntário fora da sessão, responsável e visitante levam 403', async () => {
    expect((await roster(h.tokenFor('pastor'), ids.sMat)).status).toBe(200);
    expect((await roster(h.tokenFor('secretary'), ids.sMat)).status).toBe(200);
    expect((await roster(tokenVol, ids.sMat)).status).toBe(200); // escalada em sMat
    expect((await roster(tokenVol, ids.sBebe)).status).toBe(403); // não escalada
    expect((await roster(tokenVolFora, ids.sMat)).status).toBe(403);
    expect((await roster(tokenMae, ids.sMat)).status).toBe(403);
    expect((await roster(h.tokenFor('visitor'), ids.sMat)).status).toBe(403);
    expect((await roster(h.tokenFor('cell_leader'), ids.sMat)).status).toBe(403);
  });

  it('401 sem token, 403 no plano Starter, 404 para sessão inexistente/outro tenant, 400 para id inválido', async () => {
    expect((await http().get(`/api/kids/sessions/${ids.sMat}/roster`)).status).toBe(401);
    expect((await roster(h.tokenT1('starter', 'ministry_leader'), ids.sMat)).status).toBe(403);
    expect((await roster(leader, GHOST)).status).toBe(404);
    expect((await roster(h.tokenT1('premium', 'ministry_leader'), ids.sMat)).status).toBe(404);
    expect((await roster(leader, 'x')).status).toBe(400);
  });
});

describe('etiquetas (AC 5) — POST /kids/sessions/:id/checkins e GET /kids/checkins/:id/labels', () => {
  const labels = (token: string, id: string) => http().get(`/api/kids/checkins/${id}/labels`).set(auth(token));

  it('o check-in devolve as duas etiquetas com o mesmo código; alergia só na da criança; sem QR', async () => {
    const child = await mkChild({ label: 'Etiquetada' });
    const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });

    expect(res.status).toBe(201);
    const { child_label, guardian_label } = res.body.labels;
    expect(child_label).toMatchObject({
      child_name: expect.stringContaining('Etiquetada'),
      room_name: `Maternal ${tag}`,
      has_allergy: true,
      allergy: ALERGIA,
      code: res.body.code,
    });
    expect(guardian_label).toEqual({ child_name: child_label.child_name, room_name: `Maternal ${tag}`, code: res.body.code });
    expect(JSON.stringify(res.body)).not.toContain(NOTA);
    expect(JSON.stringify(res.body)).not.toMatch(/"qr|qr_/i);
  });

  it('GET devolve as mesmas etiquetas; a leitura de saúde pela equipe é auditada sem o conteúdo', async () => {
    const child = await mkChild();
    const inn = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    const before = await admin.auditLog.count({ where: { subject_person_id: child, action: 'kids.health_read' } });

    const res = await labels(leader, inn.body.id);

    expect(res.status).toBe(200);
    expect(res.body.child_label.code).toBe(inn.body.code);
    expect(await admin.auditLog.count({ where: { subject_person_id: child, action: 'kids.health_read' } })).toBe(before + 1);
    const rows = await admin.auditLog.findMany({ where: { subject_person_id: child, action: 'kids.health_read' } });
    expect(JSON.stringify(rows)).not.toContain(ALERGIA);
  });

  it('criança sem alergia: etiqueta sem destaque', async () => {
    const child = await mkChild({ allergy: null });
    const inn = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    expect(inn.body.labels.child_label).toMatchObject({ has_allergy: false, allergy: null });
  });

  it('AC 7: só quem fez o check-in reimprime; gestão, volunteer escalado, outro responsável e visitante levam 403', async () => {
    const child = await mkChild();
    const inn = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    const otherManager = (await mkUser('Gestor', ['secretary'])).token;

    expect((await labels(leader, inn.body.id)).status).toBe(200);
    expect((await labels(otherManager, inn.body.id)).status).toBe(403);
    expect((await labels(tokenVol, inn.body.id)).status).toBe(403); // escalado em sMat, mas não fez o check-in
    expect((await labels(tokenVolFora, inn.body.id)).status).toBe(403);
    expect((await labels(tokenMae, inn.body.id)).status).toBe(403);
    expect((await labels(tokenOutra, inn.body.id)).status).toBe(403);
    expect((await labels(h.tokenFor('visitor'), inn.body.id)).status).toBe(403);
  });

  it('o responsável que fez o próprio check-in pelo app reimprime; depois da retirada, 409', async () => {
    const child = await mkChild();
    const inn = await checkIn(tokenMae, ids.sMat, { child_id: child, guardian_person_id: mae });
    expect(inn.status).toBe(201);
    expect((await labels(tokenMae, inn.body.id)).status).toBe(200);
    expect((await labels(leader, inn.body.id)).status).toBe(403);
  });

  it('404 inexistente/outro tenant, 400 com id inválido, 401 sem token, 409 depois da retirada', async () => {
    const child = await mkChild();
    const inn = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });

    expect((await labels(leader, GHOST)).status).toBe(404);
    expect((await labels(h.tokenT1('premium', 'ministry_leader'), inn.body.id)).status).toBe(404);
    expect((await labels(leader, 'x')).status).toBe(400);
    expect((await http().get(`/api/kids/checkins/${inn.body.id}/labels`)).status).toBe(401);

    await http().post(`/api/kids/checkins/${inn.body.id}/checkout`).set(auth(leader)).send({ code: inn.body.code, picked_up_by_person_id: mae });
    expect((await labels(leader, inn.body.id)).status).toBe(409);
  });
});

describe('GET /kids/children/:id/checkin (código ao responsável)', () => {
  const open = (token: string, childId: string) => http().get(`/api/kids/children/${childId}/checkin`).set(auth(token));

  it('o responsável do Household lê o check-in aberto do filho com o mesmo código do check-in', async () => {
    const child = await mkChild({ months: 36 });
    const inn = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    expect(inn.status).toBe(201);

    const res = await open(tokenMae, child);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: inn.body.id,
      session_id: ids.sMat,
      code: inn.body.code,
      room: { name: `Maternal ${tag}` },
    });
    expect(res.body.checked_in_at).toBeDefined();
  });

  it('a gestão também lê; a equipe de balcão (voluntário) e quem não é da família, não', async () => {
    const child = await mkChild({ months: 36 });
    const inn = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });

    expect((await open(leader, child)).body.code).toBe(inn.body.code);
    expect((await open(tokenVol, child)).status).toBe(403);
    expect((await open(h.tokenFor('visitor'), child)).status).toBe(403);
    // Outro responsável: 404, igual a criança inexistente.
    expect((await open(tokenOutra, child)).status).toBe(404);
  });

  it('sem check-in aberto (nunca entrou ou já foi retirada): 404', async () => {
    const child = await mkChild({ months: 36 });
    expect((await open(tokenMae, child)).status).toBe(404);

    const inn = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    await http().post(`/api/kids/checkins/${inn.body.id}/checkout`).set(auth(leader)).send({ code: inn.body.code, picked_up_by_person_id: mae });
    expect((await open(tokenMae, child)).status).toBe(404);
  });

  it('401 sem token, 400 para id malformado, 403 em plano starter e 404 para criança de outro tenant', async () => {
    const child = await mkChild({ months: 36 });
    expect((await http().get(`/api/kids/children/${child}/checkin`)).status).toBe(401);
    expect((await open(tokenMae, 'x')).status).toBe(400);
    expect((await open(h.tokenT1('starter', 'ministry_leader'), child)).status).toBe(403);
    expect((await open(h.tokenT1('premium', 'ministry_leader'), child)).status).toBe(404);
  });
});

describe('push "Criança entregue" aos responsáveis (check-out e override)', () => {
  let push: jest.SpyInstance;
  beforeEach(() => {
    push = jest.spyOn(h.app.get(NotificationsService), 'sendPush').mockResolvedValue(true);
  });
  afterEach(() => push.mockRestore());

  async function present() {
    const child = await mkChild({ months: 36, label: 'Entrega' });
    const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    expect(res.status).toBe(201);
    push.mockClear(); // o check-in tem o seu próprio aviso ("recebida"); aqui só interessa a entrega
    return { child, id: res.body.id as string, code: res.body.code as string };
  }
  const out = (id: string, body: Record<string, unknown>) =>
    http().post(`/api/kids/checkins/${id}/checkout`).set(auth(leader)).send(body);

  it('a avó retira com o código: o responsável primário (mãe) é avisado, sem dado de saúde', async () => {
    const p = await present();
    const res = await out(p.id, { code: p.code, picked_up_by_person_id: avo });

    expect(res.status).toBe(200);
    expect(push).toHaveBeenCalledTimes(1);
    const opts = push.mock.calls[0][0];
    expect(opts.filters).toEqual([
      { field: 'tag', key: 'person_id', relation: '=', value: mae },
      { field: 'tag', key: 'pref_kids', relation: '!=', value: 'false' },
    ]);
    expect(opts).toMatchObject({ title: 'Criança entregue', data: { type: 'kids_child_released', checkin_id: p.id } });
    expect(opts.body).toContain(`Entrega`);
    expect(opts.body).toContain(`Maternal ${tag}`);
    expect(JSON.stringify(opts)).not.toContain(ALERGIA);
    expect(JSON.stringify(opts)).not.toContain(NOTA);
  });

  it('quem retirou é o próprio primário: não precisa de aviso', async () => {
    const p = await present();
    expect((await out(p.id, { code: p.code, picked_up_by_person_id: mae })).status).toBe(200);
    expect(push).not.toHaveBeenCalled();
  });

  it('o override do líder também avisa o primário', async () => {
    const p = await present();
    const res = await http()
      .post(`/api/kids/checkins/${p.id}/checkout-override`)
      .set(auth(leader))
      .send({ reason: 'Perdeu o código', picked_up_by_name: 'Vizinha' });

    expect(res.status).toBe(200);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0][0].filters[0]).toMatchObject({ value: mae });
  });

  it('retirada recusada não avisa ninguém', async () => {
    const p = await present();
    const res = await out(p.id, { code: p.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ', picked_up_by_person_id: avo });
    expect(res.status).toBe(403);
    expect(push).not.toHaveBeenCalled();
  });

  // R3-3(b): além do primário, os demais responsáveis com can_pickup que têm conta.
  const accountsByPerson = new Map<string, string>();
  async function accountFor(personId: string, label: string) {
    const known = accountsByPerson.get(personId);
    if (known) return known;
    const account = await admin.userAccount.create({
      data: { ...scope, person_id: personId, email: `${label}-${ts}@kids-checkin.fake`, password_hash: 'x', is_active: true },
    });
    accountIds.push(account.id);
    accountsByPerson.set(personId, account.id);
    return account.id;
  }
  const recipients = () => push.mock.calls.map(([o]) => (o.filters[0] as { value: string }).value).sort();

  it('R3-3(b): a mãe retira — a avó (can_pickup, com conta) é avisada; o tio (sem can_pickup, com conta) não', async () => {
    await accountFor(avo, 'avo');
    await accountFor(tio, 'tio');
    const p = await present();
    expect((await out(p.id, { code: p.code, picked_up_by_person_id: mae })).status).toBe(200);
    expect(recipients()).toEqual([avo]); // mãe retirou: não duplica; tio não pode retirar: não recebe
    expect(push.mock.calls[0][0].data.type).toBe('kids_child_released');
  });

  it('R3-3(b): a avó retira — a mãe é avisada e a avó (quem retirou) não', async () => {
    await accountFor(avo, 'avo');
    const p = await present();
    expect((await out(p.id, { code: p.code, picked_up_by_person_id: avo })).status).toBe(200);
    expect(recipients()).toEqual([mae]);
  });

  it('R3-3(b): override avisa todos os responsáveis com conta que podem retirar', async () => {
    await accountFor(avo, 'avo');
    const p = await present();
    const res = await http()
      .post(`/api/kids/checkins/${p.id}/checkout-override`)
      .set(auth(leader))
      .send({ reason: 'Perdeu o código', picked_up_by_name: 'Vizinha' });
    expect(res.status).toBe(200);
    expect(recipients()).toEqual([mae, avo].sort());
  });

  it('push que falha ou rejeita (sem token, OneSignal fora): o check-out fecha do mesmo jeito', async () => {
    const p = await present();
    push.mockRejectedValue(new Error('OneSignal fora do ar'));
    const res = await out(p.id, { code: p.code, picked_up_by_person_id: avo });

    expect(res.status).toBe(200);
    expect(await openCount(p.child)).toBe(0);
  });
});

describe('push "Criança recebida na turma X" ao responsável primário (R3-3a)', () => {
  let push: jest.SpyInstance;
  beforeEach(() => {
    push = jest.spyOn(h.app.get(NotificationsService), 'sendPush').mockResolvedValue(true);
  });
  afterEach(() => push.mockRestore());
  const recipients = () => push.mock.calls.map(([o]) => (o.filters[0] as { value: string }).value).sort();

  it('a equipe faz o check-in: o primário (mãe) é avisado com a turma e só o primeiro nome, sem saúde', async () => {
    const child = await mkChild({ months: 36, label: 'Chegada' });
    const res = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: avo }); // a avó entrega
    expect(res.status).toBe(201);

    expect(push).toHaveBeenCalledTimes(1);
    const opts = push.mock.calls[0][0];
    expect(opts.filters).toEqual([
      { field: 'tag', key: 'person_id', relation: '=', value: mae },
      { field: 'tag', key: 'pref_kids', relation: '!=', value: 'false' },
    ]);
    expect(opts).toMatchObject({ title: `Criança recebida na turma Maternal ${tag}`, data: { type: 'kids_child_received', checkin_id: res.body.id } });
    expect(opts.body).toContain('Chegada');
    expect(JSON.stringify(opts)).not.toContain(ALERGIA);
    expect(JSON.stringify(opts)).not.toContain(NOTA);
  });

  it('o próprio primário faz o check-in pelo app: não recebe aviso da própria ação', async () => {
    const child = await mkChild({ months: 36 });
    const res = await checkIn(tokenMae, ids.sMat, { child_id: child, guardian_person_id: mae });
    expect(res.status).toBe(201);
    expect(push).not.toHaveBeenCalled();
  });

  it('só o primário recebe: a avó e o tio (mesmo com conta) não são avisados da chegada', async () => {
    for (const [p, label] of [[avo, 'avo2'], [tio, 'tio2']] as const) {
      const account = await admin.userAccount.create({
        data: { ...scope, person_id: p, email: `${label}-${ts}@kids-checkin.fake`, password_hash: 'x', is_active: true },
      });
      accountIds.push(account.id);
    }
    const child = await mkChild({ months: 36 });
    expect((await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: tio })).status).toBe(201);
    expect(recipients()).toEqual([mae]);
  });

  it('check-in recusado (409, faixa) não avisa; push que falha não desfaz o check-in', async () => {
    const child = await mkChild({ months: 36 });
    expect((await checkIn(leader, ids.sEstrito, { child_id: child, guardian_person_id: mae })).status).toBe(422);
    expect(push).not.toHaveBeenCalled();

    push.mockRejectedValue(new Error('OneSignal fora do ar'));
    const ok = await checkIn(leader, ids.sMat, { child_id: child, guardian_person_id: mae });
    expect(ok.status).toBe(201);
    expect(await openCount(child)).toBe(1);
  });
});
