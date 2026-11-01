/**
 * Turma desativada com sessão aberta (COV-4), edge case da spec: "Turma
 * desativada com sessões futuras: sessões abertas permanecem; novas não podem
 * ser criadas". Pelas duas rotas que desativam (`DELETE /kids/rooms/:id` e
 * `PATCH` com `is_active: false`):
 *
 *   - a sessão aberta segue aberta e operável: check-in de outra criança,
 *     roster e check-out por código continuam funcionando;
 *   - uma sessão nova para a turma, em outra instância, é 422 e não grava nada.
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
const tag = `kidsoff-${ts}`;

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let leader: string;
let leaderAccountId: string;
let mae: string;
let celebration: string;
let n = 0;

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function newInstance() {
  n += 1;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 150 + n);
  return admin.celebrationInstance.create({ data: { ...scope, celebration_id: celebration, scheduled_date: date, status: 'published' } });
}
async function newChild(label: string) {
  const birth = new Date();
  birth.setUTCMonth(birth.getUTCMonth() - 36);
  const child = await admin.person.create({
    data: { ...scope, full_name: `${label} ${n} ${tag}`, is_child: true, classification: 'attendee', birth_date: birth },
  });
  await admin.kidsGuardian.create({
    data: { ...scope, child_id: child.id, guardian_person_id: mae, relationship: 'mãe', can_pickup: true, is_primary: true },
  });
  return child.id;
}
const checkIn = (session: string, child: string) =>
  http().post(`/api/kids/sessions/${session}/checkins`).set(auth(leader)).send({ child_id: child, guardian_person_id: mae });

beforeAll(async () => {
  h = await bootKids(admin, 'kids-off');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  leader = h.tokenFor('ministry_leader');
  leaderAccountId = (h.app.get(JwtService).decode(leader) as { sub: string }).sub;
  mae = (await admin.person.create({ data: { ...scope, full_name: `Mae ${tag}`, classification: 'member' } })).id;
  await admin.consentRecord.create({
    data: { ...scope, person_id: mae, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
  });
  celebration = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto kids-off ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
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

describe.each([
  ['DELETE /kids/rooms/:id', (room: string) => http().delete(`/api/kids/rooms/${room}`).set(auth(leader))],
  ['PATCH /kids/rooms/:id { is_active: false }', (room: string) => http().patch(`/api/kids/rooms/${room}`).set(auth(leader)).send({ is_active: false })],
])('turma desativada por %s', (_nome, deactivate) => {
  it('a sessão aberta segue operável e uma sessão nova da turma é 422', async () => {
    const room = await admin.kidsRoom.create({ data: { ...scope, name: `Maternal ${n} ${tag}`, min_age_months: 24, max_age_months: 47 } });
    const inst = await newInstance();
    const session = await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: inst.id, room_id: room.id } });
    const first = await newChild('Primeira');
    const ci = await checkIn(session.id, first);
    expect(ci.status).toBe(201);

    const off = await deactivate(room.id);
    expect([200, 204]).toContain(off.status);
    expect((await admin.kidsRoom.findUniqueOrThrow({ where: { id: room.id } })).is_active).toBe(false);

    // Sessão e check-in aberto intocados.
    expect((await admin.kidsSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('open');
    const roster = await http().get(`/api/kids/sessions/${session.id}/roster`).set(auth(leader));
    expect(roster.status).toBe(200);
    expect(roster.body.present_count).toBe(1);

    // Ainda recebe e devolve crianças.
    const second = await newChild('Segunda');
    expect((await checkIn(session.id, second)).status).toBe(201);
    const out = await http()
      .post(`/api/kids/checkins/${ci.body.id}/checkout`)
      .set(auth(leader))
      .send({ code: ci.body.code, picked_up_by_person_id: mae });
    expect(out.status).toBe(200);
    expect((await http().get(`/api/kids/sessions/${session.id}/roster`).set(auth(leader))).body.present_count).toBe(1);

    // Sessão nova (outra instância): recusada, nada gravado.
    const other = await newInstance();
    const refused = await http()
      .post(`/api/celebrations/instances/${other.id}/kids-sessions`)
      .set(auth(leader))
      .send({ room_ids: [room.id] });
    expect(refused.status).toBe(422);
    expect(await admin.kidsSession.count({ where: { celebration_instance_id: other.id } })).toBe(0);
  }, 60_000);
});
