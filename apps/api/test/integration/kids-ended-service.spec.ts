/**
 * Culto encerrado com criança ainda presente (COV-3), edge case da spec: "Culto
 * termina com check-in aberto: a liderança vê a lista de crianças não retiradas
 * e fecha com motivo". Traduzido em comportamento, para os dois fins de culto
 * que existem (`finalized` e `cancelled`, pela rota real de atualizar a
 * instância):
 *
 *   - o roster da sessão segue listando quem não foi retirado;
 *   - o check-out por código segue possível (o responsável chega depois);
 *   - o override do líder, com motivo, fecha o que ficou (sem motivo, 400);
 *   - culto finalizado: o resumo de presença continua contando a criança.
 *
 * O resumo de um culto CANCELADO com criança presente não é asserido: a spec
 * não define o número (ver "Lacunas de precisão" em spec.md).
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
const tag = `kidsend-${ts}`;

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let leader: string;
let tokenAdmin: string;
let leaderAccountId: string;
let mae: string;
let celebration: string;
let room: string;
let dayOffset = 0;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function mkScenario() {
  dayOffset += 1;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 120 + dayOffset);
  const instance = await admin.celebrationInstance.create({
    data: { ...scope, celebration_id: celebration, scheduled_date: date, status: 'published' },
  });
  const session = await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance.id, room_id: room } });
  const birth = new Date();
  birth.setUTCMonth(birth.getUTCMonth() - 36);
  const child = await admin.person.create({
    data: { ...scope, full_name: `Criança ${dayOffset} ${tag}`, is_child: true, classification: 'attendee', birth_date: birth },
  });
  await admin.kidsGuardian.create({
    data: { ...scope, child_id: child.id, guardian_person_id: mae, relationship: 'mãe', can_pickup: true, is_primary: true },
  });
  const ci = await http()
    .post(`/api/kids/sessions/${session.id}/checkins`)
    .set(auth(leader))
    .send({ child_id: child.id, guardian_person_id: mae });
  expect(ci.status).toBe(201);
  return { instance, date, session: session.id, child: child.id, checkin: ci.body.id as string, code: ci.body.code as string };
}
const setStatus = (instance: string, status: 'finalized' | 'cancelled') =>
  http().patch(`/api/celebrations/instances/${instance}`).set(auth(tokenAdmin)).send({ status });
const roster = (session: string) => http().get(`/api/kids/sessions/${session}/roster`).set(auth(leader));

beforeAll(async () => {
  h = await bootKids(admin, 'kids-end');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  leader = h.tokenFor('ministry_leader');
  tokenAdmin = h.tokenFor('tenant_admin');
  leaderAccountId = (h.app.get(JwtService).decode(leader) as { sub: string }).sub;
  mae = (await admin.person.create({ data: { ...scope, full_name: `Mae ${tag}`, classification: 'member' } })).id;
  await admin.consentRecord.create({
    data: { ...scope, person_id: mae, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
  });
  celebration = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto kids-end ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  room = (await admin.kidsRoom.create({ data: { ...scope, name: `Maternal ${tag}`, min_age_months: 24, max_age_months: 47 } })).id;
}, 120_000);

afterAll(async () => {
  const persons = await admin.person.findMany({ where: { full_name: { endsWith: tag } }, select: { id: true } });
  const personIds = persons.map((p) => p.id);
  await admin.auditLog.deleteMany({ where: { OR: [{ subject_person_id: { in: personIds } }, { actor_user_id: leaderAccountId }] } });
  await admin.celebration.deleteMany({ where: { id: celebration } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('culto finalizado com criança presente', () => {
  it('o roster lista a criança, o resumo de presença a conta e o check-out por código segue possível', async () => {
    const s = await mkScenario();
    expect((await setStatus(s.instance.id, 'finalized')).status).toBe(200);

    const r = await roster(s.session);
    expect(r.status).toBe(200);
    expect(r.body.present_count).toBe(1);
    expect(r.body.items[0]).toMatchObject({ checkin_id: s.checkin, child: { id: s.child } });

    const summary = await http()
      .get('/api/kids/attendance/summary')
      .query({ date_from: dayKey(s.date), date_to: dayKey(s.date), room_id: room })
      .set(auth(leader));
    expect(summary.status).toBe(200);
    expect(summary.body.rooms).toEqual([
      expect.objectContaining({ room_id: room, sessions_counted: 1, total_children: 1 }),
    ]);

    const out = await http()
      .post(`/api/kids/checkins/${s.checkin}/checkout`)
      .set(auth(leader))
      .send({ code: s.code, picked_up_by_person_id: mae });
    expect(out.status).toBe(200);
    expect((await roster(s.session)).body.present_count).toBe(0);
  }, 60_000);

  it('o líder fecha o que ficou com motivo (sem motivo, 400) e o roster esvazia', async () => {
    const s = await mkScenario();
    await setStatus(s.instance.id, 'finalized');

    const semMotivo = await http()
      .post(`/api/kids/checkins/${s.checkin}/checkout-override`)
      .set(auth(leader))
      .send({ picked_up_by_name: 'Tio Beto' });
    expect(semMotivo.status).toBe(400);
    expect((await roster(s.session)).body.present_count).toBe(1);

    const ok = await http()
      .post(`/api/kids/checkins/${s.checkin}/checkout-override`)
      .set(auth(leader))
      .send({ reason: 'Culto acabou, família não voltou', picked_up_by_name: 'Tio Beto' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ override_reason: 'Culto acabou, família não voltou', picked_up_by_name: 'Tio Beto' });
    expect((await roster(s.session)).body.present_count).toBe(0);
  }, 60_000);
});

describe('culto cancelado com criança presente', () => {
  it('a sessão cancela, o check-in aberto fica, o roster lista e novos check-ins são recusados', async () => {
    const s = await mkScenario();
    expect((await setStatus(s.instance.id, 'cancelled')).status).toBe(200);
    expect((await admin.kidsSession.findUniqueOrThrow({ where: { id: s.session } })).status).toBe('cancelled');
    expect((await admin.kidsCheckin.findUniqueOrThrow({ where: { id: s.checkin } })).checked_out_at).toBeNull();

    const r = await roster(s.session);
    expect(r.status).toBe(200);
    expect(r.body.present_count).toBe(1);
    expect(r.body.items[0].child.id).toBe(s.child);

    const other = await admin.person.create({
      data: { ...scope, full_name: `Outra ${dayOffset} ${tag}`, is_child: true, classification: 'attendee', birth_date: new Date(Date.UTC(2023, 0, 1)) },
    });
    await admin.kidsGuardian.create({
      data: { ...scope, child_id: other.id, guardian_person_id: mae, relationship: 'mãe', can_pickup: true, is_primary: true },
    });
    const again = await http()
      .post(`/api/kids/sessions/${s.session}/checkins`)
      .set(auth(leader))
      .send({ child_id: other.id, guardian_person_id: mae });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('kids_session_cancelled');
  }, 60_000);

  it('o check-out por código e o override com motivo seguem possíveis', async () => {
    const a = await mkScenario();
    const b = await mkScenario();
    await setStatus(a.instance.id, 'cancelled');
    await setStatus(b.instance.id, 'cancelled');

    const out = await http()
      .post(`/api/kids/checkins/${a.checkin}/checkout`)
      .set(auth(leader))
      .send({ code: a.code, picked_up_by_person_id: mae });
    expect(out.status).toBe(200);
    expect((await roster(a.session)).body.present_count).toBe(0);

    const ov = await http()
      .post(`/api/kids/checkins/${b.checkin}/checkout-override`)
      .set(auth(leader))
      .send({ reason: 'Culto cancelado, criança ficou', picked_up_by_name: 'Vizinha' });
    expect(ov.status).toBe(200);
    expect(ov.body.override_reason).toBe('Culto cancelado, criança ficou');
    expect((await roster(b.session)).body.present_count).toBe(0);
  }, 60_000);
});
