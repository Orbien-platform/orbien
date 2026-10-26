/**
 * Escala de voluntários kids por HTTP (spec P2 "Escala e contagem", AC 1, 2 e 5),
 * contra o Postgres com RLS. Nada de dado montado "na mão" na escala: o vínculo
 * entre a escala e a sessão nasce das rotas reais (adicionar ministério com
 * `kids_session_id` e escalar o voluntário) e é isso que abre a porta do
 * roster e do check-in para o voluntário.
 *
 * Roda em `teste2-church` (Premium); `teste1-church` entra só como "outro
 * tenant". Apaga o que criou.
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';
import { KIDS_TERM_VERSION } from '../../src/kids/consent/kids-consent.terms';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidssch-${ts}`;

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let tokenAdmin: string;
let tokenVol: string;
let tokenMember: string;
let adminAccountId: string;
const accountIds: string[] = [];
const ids = {
  celebration: '', i1: '', i2: '', sMat: '', sBebe: '', sOutraInst: '', sCancel: '', sOutroTenant: '',
  ministry: '', profile: '', mae: '', child: '',
};

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const GHOST = '00000000-0000-4000-8000-000000000000';
const addMinistry = (token: string, instance: string, body: Record<string, unknown>) =>
  http().post(`/api/celebrations/instances/${instance}/schedule/ministries`).set(auth(token)).send(body);
const roster = (token: string, session: string) => http().get(`/api/kids/sessions/${session}/roster`).set(auth(token));

async function mkUser(label: string, roles: string[]) {
  const person = await admin.person.create({ data: { ...scope, full_name: `${label} ${tag}`, classification: 'member' } });
  const account = await admin.userAccount.create({
    data: { ...scope, person_id: person.id, email: `${label}-${ts}@kids-schedule.fake`, password_hash: 'x', is_active: true },
  });
  accountIds.push(account.id);
  const token = h.app.get(JwtService).sign({
    sub: account.id, email: account.email, tenant_id: scope.tenant_id, congregation_id: scope.congregation_id, roles, plan: 'premium',
  });
  return { personId: person.id, token };
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-schedule');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  tokenAdmin = h.tokenFor('tenant_admin');
  adminAccountId = (h.app.get(JwtService).decode(tokenAdmin) as { sub: string }).sub;

  const vol = await mkUser('Voluntaria', ['volunteer']);
  tokenVol = vol.token;
  tokenMember = (await mkUser('Membro', ['member'])).token;
  const mae = await mkUser('Mae', ['member']);
  ids.mae = mae.personId;
  await admin.consentRecord.create({
    data: { ...scope, person_id: ids.mae, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
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
      { household_id: household.id, person_id: ids.mae, role: 'head' },
      { household_id: household.id, person_id: child.id, role: 'child' },
    ],
  });
  await admin.kidsGuardian.create({
    data: { ...scope, child_id: child.id, guardian_person_id: ids.mae, relationship: 'mãe', can_pickup: true, is_primary: true },
  });

  ids.celebration = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto kids-schedule ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  const inst = async (offset: number) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + 90 + offset);
    return admin.celebrationInstance.create({
      data: { ...scope, celebration_id: ids.celebration, scheduled_date: d, status: 'published' },
    });
  };
  ids.i1 = (await inst(0)).id;
  ids.i2 = (await inst(1)).id;

  const room = (name: string, min: number, max: number, min_volunteers: number) =>
    admin.kidsRoom.create({ data: { ...scope, name: `${name} ${tag}`, min_age_months: min, max_age_months: max, min_volunteers } });
  const rMat = await room('Maternal', 24, 47, 2);
  const rBebe = await room('Bebês', 0, 11, 1);
  const rCancel = await room('Cancelada', 0, 200, 0);
  const sess = (instance: string, roomId: string, status: 'open' | 'cancelled' = 'open') =>
    admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance, room_id: roomId, status } });
  ids.sMat = (await sess(ids.i1, rMat.id)).id;
  ids.sBebe = (await sess(ids.i1, rBebe.id)).id;
  ids.sCancel = (await sess(ids.i1, rCancel.id, 'cancelled')).id;
  ids.sOutraInst = (await sess(ids.i2, rMat.id)).id;

  // Sessão de OUTRO tenant (teste1): nunca pode ser ligada à escala do teste2.
  const t1 = { tenant_id: h.t1.tenantId, congregation_id: h.t1.congregationId };
  const c1 = await admin.celebration.create({
    data: { ...t1, name: `Culto kids-schedule t1 ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
  });
  const i1t1 = await admin.celebrationInstance.create({
    data: { ...t1, celebration_id: c1.id, scheduled_date: new Date(Date.UTC(2031, 0, 5)), status: 'published' },
  });
  const r1 = await admin.kidsRoom.create({
    data: { ...t1, name: `Sala t1 ${tag}`, min_age_months: 0, max_age_months: 100 },
  });
  ids.sOutroTenant = (
    await admin.kidsSession.create({ data: { ...t1, celebration_instance_id: i1t1.id, room_id: r1.id } })
  ).id;

  // Voluntária membro do ministério Kids (pré-requisito de escalar).
  ids.ministry = (await admin.ministry.create({ data: { ...scope, name: `Kids ${tag}` } })).id;
  ids.profile = (
    await admin.volunteerProfile.create({ data: { ...scope, person_id: vol.personId, availability: {}, skills: [] } })
  ).id;
  await admin.volunteerMinistry.create({
    data: { ...scope, volunteer_profile_id: ids.profile, ministry_id: ids.ministry },
  });
}, 120_000);

afterAll(async () => {
  const persons = await admin.person.findMany({ where: { full_name: { endsWith: tag } }, select: { id: true, household_id: true } });
  const personIds = persons.map((p) => p.id);
  const householdIds = persons.map((p) => p.household_id).filter((x): x is string => !!x);
  await admin.auditLog.deleteMany({ where: { OR: [{ subject_person_id: { in: personIds } }, { actor_user_id: { in: [adminAccountId, ...accountIds] } }] } });
  await admin.celebration.deleteMany({ where: { name: { in: [`Culto kids-schedule ${ts}`, `Culto kids-schedule t1 ${ts}`] } } });
  await admin.volunteerProfile.deleteMany({ where: { person: { full_name: { endsWith: tag } } } });
  await admin.ministry.deleteMany({ where: { name: `Kids ${tag}` } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.household.deleteMany({ where: { id: { in: householdIds } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('escala por sessão kids (P2 Escala)', () => {
  it('AC 1 ponta a ponta: escalar liga o voluntário à sessão e abre roster e check-in só dela', async () => {
    // Antes de escalar: sem vínculo, sem porta.
    expect((await roster(tokenVol, ids.sMat)).status).toBe(403);

    const cm = await addMinistry(tokenAdmin, ids.i1, { ministry_id: ids.ministry, slots: 3, kids_session_id: ids.sMat });
    expect(cm.status).toBe(201);
    expect(cm.body.kids_session_id).toBe(ids.sMat);

    // Ministério ligado à sessão, ainda sem voluntário: continua sem porta.
    expect((await roster(tokenVol, ids.sMat)).status).toBe(403);

    const asg = await http()
      .post(`/api/celebrations/instances/${ids.i1}/schedule/ministries/${cm.body.id}/assignments`)
      .set(auth(tokenAdmin))
      .send({ volunteer_profile_id: ids.profile });
    expect(asg.status).toBe(201);
    expect(asg.body.status).toBe('pending');

    // Escalada (pending): roster da SUA sessão abre; o da outra turma não.
    expect((await roster(tokenVol, ids.sMat)).status).toBe(200);
    expect((await roster(tokenVol, ids.sBebe)).status).toBe(403);

    // E o check-in da sua sessão também.
    const ci = await http()
      .post(`/api/kids/sessions/${ids.sMat}/checkins`)
      .set(auth(tokenVol))
      .send({ child_id: ids.child, guardian_person_id: ids.mae });
    expect(ci.status).toBe(201);
    const ciOutra = await http()
      .post(`/api/kids/sessions/${ids.sBebe}/checkins`)
      .set(auth(tokenVol))
      .send({ child_id: ids.child, guardian_person_id: ids.mae });
    expect(ciOutra.status).toBe(403);

    // Publicar a escala é o que habilita responder (fluxo existente, inalterado).
    const pub = await http().patch(`/api/celebrations/instances/${ids.i1}/schedule/publish`).set(auth(tokenAdmin));
    expect([200, 201]).toContain(pub.status);

    // Confirmar mantém a porta aberta.
    const confirm = await http().patch(`/api/assignments/${asg.body.id}/respond`).set(auth(tokenVol)).send({ status: 'confirmed' });
    expect(confirm.status).toBe(200);
    expect((await roster(tokenVol, ids.sMat)).status).toBe(200);
  }, 60_000);

  it('AC 5: "Minhas escalas" traz a turma da sessão (escala publicada) e o horário vem da celebração', async () => {
    const res = await http().get('/api/volunteers/my-celebration-assignments').set(auth(tokenVol));
    expect(res.status).toBe(200);
    const item = res.body.find((a: { celebration_instance_id: string }) => a.celebration_instance_id === ids.i1);
    expect(item.kids_session).toEqual({
      id: ids.sMat, room_id: expect.any(String), room_name: `Maternal ${tag}`, status: 'open',
    });
    expect(item.celebration.start_time).toBe('10:00');
  });

  it('AC 2: a escala e a lista de sessões sinalizam a falta contra o mínimo da turma', async () => {
    // Maternal pede 2 e há 1 escalada (confirmed).
    const sched = await http().get(`/api/celebrations/instances/${ids.i1}/schedule`).set(auth(tokenAdmin));
    expect(sched.status).toBe(200);
    const row = sched.body.ministries.find((m: { kids_session_id: string }) => m.kids_session_id === ids.sMat);
    expect(row.volunteers_missing).toBe(1);
    expect(row.kids_session).toMatchObject({ id: ids.sMat, room_name: `Maternal ${tag}`, min_volunteers: 2 });

    const list = await http().get(`/api/celebrations/instances/${ids.i1}/kids-sessions`).set(auth(tokenAdmin));
    expect(list.status).toBe(200);
    const bySession = (id: string) => list.body.find((s: { id: string }) => s.id === id);
    expect(bySession(ids.sMat)).toMatchObject({ volunteers_scheduled: 1, volunteers_missing: 1 });
    // Bebês pede 1 e ninguém escalado: falta 1. Cancelada não pede ninguém: 0.
    expect(bySession(ids.sBebe)).toMatchObject({ volunteers_scheduled: 0, volunteers_missing: 1 });
    expect(bySession(ids.sCancel)).toMatchObject({ volunteers_scheduled: 0, volunteers_missing: 0 });
  }, 60_000);

  it('recusar tira a vaga: fecha a porta do roster e não conta como escalado', async () => {
    const vol2 = await mkUser('Voluntario2', ['volunteer']);
    const profile2 = await admin.volunteerProfile.create({
      data: { ...scope, person_id: vol2.personId, availability: {}, skills: [] },
    });
    await admin.volunteerMinistry.create({ data: { ...scope, volunteer_profile_id: profile2.id, ministry_id: ids.ministry } });
    const cmId = (await admin.celebrationMinistry.findFirstOrThrow({ where: { kids_session_id: ids.sMat } })).id;

    const asg = await http()
      .post(`/api/celebrations/instances/${ids.i1}/schedule/ministries/${cmId}/assignments`)
      .set(auth(tokenAdmin))
      .send({ volunteer_profile_id: profile2.id });
    expect(asg.status).toBe(201);
    expect((await roster(vol2.token, ids.sMat)).status).toBe(200);
    const two = await http().get(`/api/celebrations/instances/${ids.i1}/kids-sessions`).set(auth(tokenAdmin));
    expect(two.body.find((s: { id: string }) => s.id === ids.sMat)).toMatchObject({ volunteers_scheduled: 2, volunteers_missing: 0 });

    const decline = await http().patch(`/api/assignments/${asg.body.id}/respond`).set(auth(vol2.token)).send({ status: 'declined' });
    expect(decline.status).toBe(200);

    expect((await roster(vol2.token, ids.sMat)).status).toBe(403);
    const one = await http().get(`/api/celebrations/instances/${ids.i1}/kids-sessions`).set(auth(tokenAdmin));
    expect(one.body.find((s: { id: string }) => s.id === ids.sMat)).toMatchObject({ volunteers_scheduled: 1, volunteers_missing: 1 });
  }, 60_000);

  it('o mesmo ministério escala outra turma da instância; a mesma sessão duas vezes é 409', async () => {
    const outra = await addMinistry(tokenAdmin, ids.i1, { ministry_id: ids.ministry, slots: 1, kids_session_id: ids.sBebe });
    expect(outra.status).toBe(201);

    const dup = await addMinistry(tokenAdmin, ids.i1, { ministry_id: ids.ministry, slots: 1, kids_session_id: ids.sBebe });
    expect(dup.status).toBe(409);

    // Sem sessão é um terceiro vínculo possível (a unicidade comum segue valendo).
    expect((await addMinistry(tokenAdmin, ids.i1, { ministry_id: ids.ministry, slots: 1 })).status).toBe(201);
    expect((await addMinistry(tokenAdmin, ids.i1, { ministry_id: ids.ministry, slots: 1 })).status).toBe(409);
  });

  it('remover com kids_session_id apaga só o vínculo daquela sessão', async () => {
    const del = await http()
      .delete(`/api/celebrations/instances/${ids.i1}/schedule/ministries/${ids.ministry}`)
      .query({ kids_session_id: ids.sBebe })
      .set(auth(tokenAdmin));
    expect(del.status).toBe(200);
    const left = await admin.celebrationMinistry.findMany({ where: { ministry_id: ids.ministry }, select: { kids_session_id: true } });
    expect(left.map((l) => l.kids_session_id).sort()).toEqual([ids.sMat, null].sort());

    expect(
      (await http().delete(`/api/celebrations/instances/${ids.i1}/schedule/ministries/${ids.ministry}`).query({ kids_session_id: 'x' }).set(auth(tokenAdmin))).status,
    ).toBe(400);
  });

  it('400 com kids_session_id que não é UUID', async () => {
    const res = await addMinistry(tokenAdmin, ids.i1, { ministry_id: ids.ministry, slots: 1, kids_session_id: 'abc' });
    expect(res.status).toBe(400);
  });

  it('404 quando a sessão é de outra instância, de outro tenant ou não existe', async () => {
    for (const kids_session_id of [ids.sOutraInst, ids.sOutroTenant, GHOST]) {
      const res = await addMinistry(tokenAdmin, ids.i1, { ministry_id: ids.ministry, slots: 1, kids_session_id });
      expect(res.status).toBe(404);
    }
    // Nada foi gravado com essas sessões.
    expect(
      await admin.celebrationMinistry.count({ where: { kids_session_id: { in: [ids.sOutraInst, ids.sOutroTenant] } } }),
    ).toBe(0);
  });

  it('422 quando a sessão está cancelada', async () => {
    const res = await addMinistry(tokenAdmin, ids.i1, { ministry_id: ids.ministry, slots: 1, kids_session_id: ids.sCancel });
    expect(res.status).toBe(422);
  });

  it('403 para volunteer e member (só a gestão da escala liga sessão)', async () => {
    for (const token of [tokenVol, tokenMember]) {
      const res = await addMinistry(token, ids.i1, { ministry_id: ids.ministry, slots: 1, kids_session_id: ids.sBebe });
      expect(res.status).toBe(403);
    }
  });

  it('403 no plano Starter (gate premium) ao ligar sessão', async () => {
    const res = await addMinistry(h.tokenT1('starter', 'tenant_admin'), ids.i1, {
      ministry_id: ids.ministry, slots: 1, kids_session_id: ids.sBebe,
    });
    expect(res.status).toBe(403);
  });
});
