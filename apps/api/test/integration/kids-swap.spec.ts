/**
 * Troca de escala de voluntário numa sessão kids (COV-5), spec P2 "Escala e
 * contagem", AC 1: a escala kids reaproveita confirmação E troca. Ponta a ponta
 * pelo fluxo real de swap (`POST /assignments/:id/swap-requests`,
 * `PATCH /swap-requests/:id/accept`):
 *
 *   - com o pedido ainda pendente, quem pediu continua escalado (e quem pode
 *     assumir ainda não está);
 *   - aceita a troca, quem aceitou passa a ver o roster e a fazer check-in/out
 *     DAQUELA sessão (e só dela), e quem trocou perde os dois.
 *
 * Roda em `teste2-church` (Premium). Apaga o que criou.
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';
import { KIDS_TERM_VERSION } from '../../src/kids/consent/kids-consent.terms';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidsswp-${ts}`;

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
const accountIds: string[] = [];
const ids = {
  celebration: '', ministry: '', sMat: '', sBebe: '', assignmentAna: '', mae: '', child: '', childBebe: '',
  profileAna: '', profileBia: '',
};
let tokenAna: string;
let tokenBia: string;

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const roster = (token: string, session: string) => http().get(`/api/kids/sessions/${session}/roster`).set(auth(token));
const checkIn = (token: string, session: string, child: string) =>
  http().post(`/api/kids/sessions/${session}/checkins`).set(auth(token)).send({ child_id: child, guardian_person_id: ids.mae });

async function mkVolunteer(label: string) {
  const person = await admin.person.create({ data: { ...scope, full_name: `${label} ${tag}`, classification: 'member' } });
  const account = await admin.userAccount.create({
    data: { ...scope, person_id: person.id, email: `${label}-${ts}@kids-swap.fake`, password_hash: 'x', is_active: true },
  });
  accountIds.push(account.id);
  const profile = await admin.volunteerProfile.create({ data: { ...scope, person_id: person.id, availability: {}, skills: [] } });
  await admin.volunteerMinistry.create({ data: { ...scope, volunteer_profile_id: profile.id, ministry_id: ids.ministry } });
  const token = h.app.get(JwtService).sign({
    sub: account.id, email: account.email, tenant_id: scope.tenant_id, congregation_id: scope.congregation_id, roles: ['volunteer'], plan: 'premium',
  });
  return { token, profileId: profile.id };
}

async function mkChild(months: number, label: string) {
  const birth = new Date();
  birth.setUTCMonth(birth.getUTCMonth() - months);
  const child = await admin.person.create({
    data: { ...scope, full_name: `${label} ${tag}`, is_child: true, classification: 'attendee', birth_date: birth },
  });
  await admin.kidsGuardian.create({
    data: { ...scope, child_id: child.id, guardian_person_id: ids.mae, relationship: 'mãe', can_pickup: true, is_primary: true },
  });
  return child.id;
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-swap');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  ids.mae = (await admin.person.create({ data: { ...scope, full_name: `Mae ${tag}`, classification: 'member' } })).id;
  await admin.consentRecord.create({
    data: { ...scope, person_id: ids.mae, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
  });
  ids.child = await mkChild(36, 'Maternal');
  ids.childBebe = await mkChild(6, 'Bebe');

  ids.ministry = (await admin.ministry.create({ data: { ...scope, name: `Kids ${tag}` } })).id;
  const ana = await mkVolunteer('Ana');
  const bia = await mkVolunteer('Bia');
  tokenAna = ana.token;
  tokenBia = bia.token;
  ids.profileAna = ana.profileId;
  ids.profileBia = bia.profileId;

  ids.celebration = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto kids-swap ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 45);
  const instance = await admin.celebrationInstance.create({
    data: { ...scope, celebration_id: ids.celebration, scheduled_date: date, status: 'published' },
  });
  const room = (name: string, min: number, max: number) =>
    admin.kidsRoom.create({ data: { ...scope, name: `${name} ${tag}`, min_age_months: min, max_age_months: max } });
  const rMat = await room('Maternal', 24, 47);
  const rBebe = await room('Bebês', 0, 11);
  ids.sMat = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance.id, room_id: rMat.id } })).id;
  ids.sBebe = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance.id, room_id: rBebe.id } })).id;

  const schedule = await admin.celebrationSchedule.create({
    data: { ...scope, celebration_instance_id: instance.id, status: 'published' },
  });
  const cm = await admin.celebrationMinistry.create({
    data: { ...scope, schedule_id: schedule.id, ministry_id: ids.ministry, slots: 1, kids_session_id: ids.sMat },
  });
  ids.assignmentAna = (
    await admin.celebrationAssignment.create({
      data: { ...scope, celebration_ministry_id: cm.id, volunteer_profile_id: ids.profileAna, status: 'confirmed' },
    })
  ).id;
}, 120_000);

afterAll(async () => {
  const persons = await admin.person.findMany({ where: { full_name: { endsWith: tag } }, select: { id: true } });
  const personIds = persons.map((p) => p.id);
  await admin.auditLog.deleteMany({ where: { OR: [{ subject_person_id: { in: personIds } }, { actor_user_id: { in: accountIds } }] } });
  await admin.celebration.deleteMany({ where: { id: ids.celebration } });
  await admin.volunteerProfile.deleteMany({ where: { person_id: { in: personIds } } });
  await admin.ministry.deleteMany({ where: { id: ids.ministry } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('troca de escala numa sessão kids (P2 Escala, AC 1)', () => {
  let requestId: string;

  it('antes da troca: só quem está escalado opera a sessão', async () => {
    expect((await roster(tokenAna, ids.sMat)).status).toBe(200);
    expect((await roster(tokenBia, ids.sMat)).status).toBe(403);
    expect((await checkIn(tokenBia, ids.sMat, ids.child)).status).toBe(403);
  });

  it('pedido de troca pendente: quem pediu continua escalado, o colega ainda não', async () => {
    const res = await http().post(`/api/assignments/${ids.assignmentAna}/swap-requests`).set(auth(tokenAna)).send({});
    expect(res.status).toBe(201);
    requestId = res.body.id;

    expect((await roster(tokenAna, ids.sMat)).status).toBe(200);
    expect((await roster(tokenBia, ids.sMat)).status).toBe(403);
  });

  it('o colega aceita: ganha roster, check-in e check-out só desta sessão; quem trocou perde', async () => {
    const accept = await http().patch(`/api/swap-requests/${requestId}/accept`).set(auth(tokenBia));
    expect(accept.status).toBe(200);
    expect(accept.body.status).toBe('accepted');

    // Quem aceitou.
    expect((await roster(tokenBia, ids.sMat)).status).toBe(200);
    const ci = await checkIn(tokenBia, ids.sMat, ids.child);
    expect(ci.status).toBe(201);
    expect((await roster(tokenBia, ids.sMat)).body.present_count).toBe(1);
    const out = await http()
      .post(`/api/kids/checkins/${ci.body.id}/checkout`)
      .set(auth(tokenBia))
      .send({ code: ci.body.code, picked_up_by_person_id: ids.mae });
    expect(out.status).toBe(200);
    // A porta é só da sessão da escala, não de outra turma.
    expect((await roster(tokenBia, ids.sBebe)).status).toBe(403);
    expect((await checkIn(tokenBia, ids.sBebe, ids.childBebe)).status).toBe(403);

    // Quem trocou.
    expect((await roster(tokenAna, ids.sMat)).status).toBe(403);
    expect((await checkIn(tokenAna, ids.sMat, ids.child)).status).toBe(403);
    const original = await admin.celebrationAssignment.findUniqueOrThrow({ where: { id: ids.assignmentAna } });
    expect(original.status).toBe('swapped');
  }, 60_000);

  it('o check-in em aberto de antes da troca só fecha para quem está escalado agora', async () => {
    // Criança entrou pela mão do gestor antes; Ana (trocou) não fecha, Bia fecha.
    const leader = h.tokenFor('ministry_leader');
    const ci = await checkIn(leader, ids.sMat, ids.child);
    expect(ci.status).toBe(201);
    const body = { code: ci.body.code, picked_up_by_person_id: ids.mae };
    expect((await http().post(`/api/kids/checkins/${ci.body.id}/checkout`).set(auth(tokenAna)).send(body)).status).toBe(403);
    expect((await http().post(`/api/kids/checkins/${ci.body.id}/checkout`).set(auth(tokenBia)).send(body)).status).toBe(200);
  }, 60_000);
});
