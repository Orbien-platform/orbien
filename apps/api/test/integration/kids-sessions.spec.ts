/**
 * Sessões do Kids por HTTP (spec "Turmas e sessões por culto", AC 3 a 6),
 * contra o Postgres com RLS (rotas rodam como `app_user`).
 *
 * Roda em `teste2-church` (Premium); `teste1-church` entra só como "outro
 * tenant" no isolamento. Apaga o que criou.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
let h: KidsHarness;
let lider: string;
let scope: { tenant_id: string; congregation_id: string };
let celebrationId: string;
let roomMaternal: string;
let roomJunior: string;
let roomOff: string;
const personIds: string[] = [];

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const URL = (instanceId: string) => `/api/celebrations/instances/${instanceId}/kids-sessions`;

let dayOffset = 0;
async function newInstance(status: 'draft' | 'cancelled' = 'draft') {
  dayOffset += 1;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 30 + dayOffset);
  return admin.celebrationInstance.create({
    data: { ...scope, celebration_id: celebrationId, scheduled_date: date, status },
  });
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-sessions');
  lider = h.tokenFor('ministry_leader');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };

  celebrationId = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto kids-sessions ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  const mk = async (name: string, min: number, max: number, is_active = true) =>
    (await admin.kidsRoom.create({ data: { ...scope, name: `${name} sessions-${ts}`, min_age_months: min, max_age_months: max, is_active } })).id;
  roomMaternal = await mk('Maternal', 24, 47);
  roomJunior = await mk('Júnior', 72, 119);
  roomOff = await mk('Desativada', 0, 11, false);
}, 120_000);

afterAll(async () => {
  // As sessões e instâncias saem em cascata com a celebração e as turmas.
  await admin.celebration.deleteMany({ where: { id: celebrationId } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: `sessions-${ts}` } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('POST /celebrations/instances/:id/kids-sessions', () => {
  it('abre duas turmas no culto e lista ordenado por idade; o culto seguinte abre só uma', async () => {
    const first = await newInstance();
    const second = await newInstance();
    const third = await newInstance();

    const both = await http().post(URL(first.id)).set(auth(lider)).send({ room_ids: [roomJunior, roomMaternal] });
    expect(both.status).toBe(201);
    expect(both.body).toHaveLength(2);
    expect(both.body[0]).toMatchObject({
      status: 'open',
      celebration_instance_id: first.id,
      tenant_id: h.t2.tenantId,
      congregation_id: h.t2.congregationId,
    });

    expect((await http().post(URL(second.id)).set(auth(lider)).send({ room_ids: [roomMaternal] })).status).toBe(201);

    const list1 = await http().get(URL(first.id)).set(auth(lider));
    expect(list1.body.map((s: { room: { id: string } }) => s.room.id)).toEqual([roomMaternal, roomJunior]);
    const list2 = await http().get(URL(second.id)).set(auth(lider));
    expect(list2.body).toHaveLength(1);

    // terceiro culto: sem sessão, sem erro (AC 5)
    const list3 = await http().get(URL(third.id)).set(auth(lider));
    expect(list3.status).toBe(200);
    expect(list3.body).toEqual([]);
  });

  it('409 no par repetido, sem duplicar e sem abrir as outras turmas do pedido', async () => {
    const inst = await newInstance();
    await http().post(URL(inst.id)).set(auth(lider)).send({ room_ids: [roomMaternal] });

    const again = await http().post(URL(inst.id)).set(auth(lider)).send({ room_ids: [roomJunior, roomMaternal] });

    expect(again.status).toBe(409);
    expect(await admin.kidsSession.count({ where: { celebration_instance_id: inst.id } })).toBe(1);
  });

  it('409 (e não 500) em duas aberturas simultâneas da mesma turma', async () => {
    const inst = await newInstance();
    const send = () => http().post(URL(inst.id)).set(auth(lider)).send({ room_ids: [roomMaternal] });
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('422 em turma desativada', async () => {
    const inst = await newInstance();
    const res = await http().post(URL(inst.id)).set(auth(lider)).send({ room_ids: [roomOff] });
    expect(res.status).toBe(422);
    expect(await admin.kidsSession.count({ where: { celebration_instance_id: inst.id } })).toBe(0);
  });

  it('422 em instância cancelada', async () => {
    const inst = await newInstance('cancelled');
    const res = await http().post(URL(inst.id)).set(auth(lider)).send({ room_ids: [roomMaternal] });
    expect(res.status).toBe(422);
  });

  it('404 em instância ou turma inexistente', async () => {
    const inst = await newInstance();
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect((await http().post(URL(ghost)).set(auth(lider)).send({ room_ids: [roomMaternal] })).status).toBe(404);
    expect((await http().post(URL(inst.id)).set(auth(lider)).send({ room_ids: [ghost] })).status).toBe(404);
  });

  it.each([
    ['sem room_ids', {}],
    ['room_ids vazio', { room_ids: [] }],
    ['id que não é UUID', { room_ids: ['x'] }],
    ['turma repetida no corpo', { room_ids: ['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111'] }],
    ['congregação no corpo', { room_ids: [], congregation_id: 'x' }],
  ])('400 com %s', async (_label, payload) => {
    const inst = await newInstance();
    expect((await http().post(URL(inst.id)).set(auth(lider)).send(payload)).status).toBe(400);
  });

  it.each(['member', 'volunteer'])('403 para %s', async (role) => {
    const inst = await newInstance();
    const res = await http().post(URL(inst.id)).set(auth(h.tokenFor(role))).send({ room_ids: [roomMaternal] });
    expect(res.status).toBe(403);
  });

  it('403 no tenant Starter (gate Premium)', async () => {
    const inst = await newInstance();
    const res = await http().post(URL(inst.id)).set(auth(h.tokenT1('starter', 'tenant_admin'))).send({ room_ids: [roomMaternal] });
    expect(res.status).toBe(403);
  });

  it('404 para quem é de outro tenant (RLS)', async () => {
    const inst = await newInstance();
    const res = await http().post(URL(inst.id)).set(auth(h.tokenT1('premium', 'tenant_admin'))).send({ room_ids: [roomMaternal] });
    expect(res.status).toBe(404);
  });
});

describe('GET /celebrations/instances/:id/kids-sessions', () => {
  it('volunteer lê; member não', async () => {
    const inst = await newInstance();
    expect((await http().get(URL(inst.id)).set(auth(h.tokenFor('volunteer')))).status).toBe(200);
    expect((await http().get(URL(inst.id)).set(auth(h.tokenFor('member')))).status).toBe(403);
  });

  it('404 para instância de outro tenant', async () => {
    const inst = await newInstance();
    expect((await http().get(URL(inst.id)).set(auth(h.tokenT1('premium', 'tenant_admin')))).status).toBe(404);
  });
});

describe('DELETE /kids/sessions/:id', () => {
  async function openSession() {
    const inst = await newInstance();
    const res = await http().post(URL(inst.id)).set(auth(lider)).send({ room_ids: [roomMaternal] });
    return { inst, session: res.body[0] as { id: string } };
  }

  it('cancela a sessão sem check-in', async () => {
    const { session } = await openSession();
    const res = await http().delete(`/api/kids/sessions/${session.id}`).set(auth(lider));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect((await admin.kidsSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('cancelled');
  });

  it('422 com check-in aberto; cancela depois do check-out', async () => {
    const { inst, session } = await openSession();
    const child = await admin.person.create({ data: { ...scope, full_name: `Criança sessions-${ts}`, is_child: true } });
    const guardian = await admin.person.create({ data: { ...scope, full_name: `Responsável sessions-${ts}` } });
    personIds.push(child.id, guardian.id);
    const checkin = await admin.kidsCheckin.create({
      data: {
        ...scope,
        session_id: session.id,
        celebration_instance_id: inst.id,
        child_id: child.id,
        guardian_person_id: guardian.id,
        code: '7K2M',
        checked_in_by: 'u',
      },
    });

    const blocked = await http().delete(`/api/kids/sessions/${session.id}`).set(auth(lider));
    expect(blocked.status).toBe(422);
    expect((await admin.kidsSession.findUniqueOrThrow({ where: { id: session.id } })).status).toBe('open');

    await admin.kidsCheckin.update({ where: { id: checkin.id }, data: { checked_out_at: new Date() } });
    expect((await http().delete(`/api/kids/sessions/${session.id}`).set(auth(lider))).status).toBe(200);
  });

  it('404 para sessão inexistente e para outro tenant; 403 para volunteer', async () => {
    const { session } = await openSession();
    expect((await http().delete('/api/kids/sessions/00000000-0000-4000-8000-000000000000').set(auth(lider))).status).toBe(404);
    expect((await http().delete(`/api/kids/sessions/${session.id}`).set(auth(h.tokenT1('premium', 'tenant_admin')))).status).toBe(404);
    expect((await http().delete(`/api/kids/sessions/${session.id}`).set(auth(h.tokenFor('volunteer')))).status).toBe(403);
  });
});

describe('instância cancelada cancela as sessões (AC 6)', () => {
  it('PATCH da instância para cancelled', async () => {
    const inst = await newInstance();
    await http().post(URL(inst.id)).set(auth(lider)).send({ room_ids: [roomMaternal, roomJunior] });

    const res = await http().patch(`/api/celebrations/instances/${inst.id}`).set(auth(h.tokenFor('pastor'))).send({ status: 'cancelled' });

    expect(res.status).toBe(200);
    const sessions = await admin.kidsSession.findMany({ where: { celebration_instance_id: inst.id } });
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.status === 'cancelled')).toBe(true);
  });
});
