/**
 * Modelo de turmas kids por celebração e aplicação em lote por HTTP
 * (spec "Turmas e sessões por culto", AC 7), contra o Postgres com RLS.
 *
 * Roda em `teste2-church` (Premium); `teste1-church` entra só como "outro
 * tenant". Apaga o que criou.
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
let semModeloId: string;
let roomA: string;
let roomB: string;
let roomOff: string;
const instances: { id: string; date: Date }[] = [];

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const T = (id: string) => `/api/celebrations/${id}/kids-template`;
const day = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

beforeAll(async () => {
  h = await bootKids(admin, 'kids-template');
  lider = h.tokenFor('ministry_leader');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };

  const mkCelebration = async (name: string) =>
    (await admin.celebration.create({ data: { ...scope, name: `${name} ktpl-${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' } })).id;
  celebrationId = await mkCelebration('Culto');
  semModeloId = await mkCelebration('Sem modelo');

  const mkRoom = async (name: string, min: number, max: number, is_active = true) =>
    (await admin.kidsRoom.create({ data: { ...scope, name: `${name} ktpl-${ts}`, min_age_months: min, max_age_months: max, is_active } })).id;
  roomA = await mkRoom('Maternal', 24, 47);
  roomB = await mkRoom('Júnior', 72, 119);
  roomOff = await mkRoom('Desativada', 0, 11, false);

  // passado, três futuros (um cancelado) e um além da janela usada nos testes
  const mk = async (offset: number, status: 'draft' | 'cancelled' = 'draft') => {
    const date = day(offset);
    const i = await admin.celebrationInstance.create({ data: { ...scope, celebration_id: celebrationId, scheduled_date: date, status } });
    instances.push({ id: i.id, date });
    return i.id;
  };
  await mk(-7);
  await mk(7);
  await mk(14);
  await mk(21, 'cancelled');
  await mk(60);
}, 120_000);

afterAll(async () => {
  await admin.celebration.deleteMany({ where: { name: { endsWith: `ktpl-${ts}` } } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: `ktpl-${ts}` } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

const sessionsOf = (instanceId: string) => admin.kidsSession.findMany({ where: { celebration_instance_id: instanceId } });

describe('POST/GET /celebrations/:id/kids-template', () => {
  it('celebração nova nasce sem modelo', async () => {
    const res = await http().get(T(celebrationId)).set(auth(lider));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ celebration_id: celebrationId, room_ids: [], rooms: [] });
  });

  it('define o modelo e devolve as turmas por idade', async () => {
    const set = await http().post(T(celebrationId)).set(auth(lider)).send({ room_ids: [roomB, roomA] });
    expect(set.status).toBe(201);
    expect(set.body.room_ids).toEqual([roomB, roomA]);

    const got = await http().get(T(celebrationId)).set(auth(lider));
    expect(got.body.rooms.map((r: { id: string }) => r.id)).toEqual([roomA, roomB]);
    expect((await admin.celebration.findUniqueOrThrow({ where: { id: celebrationId } })).kids_default_room_ids).toEqual([roomB, roomA]);
  });

  it('lista vazia limpa o modelo', async () => {
    await http().post(T(semModeloId)).set(auth(lider)).send({ room_ids: [roomA] });
    const res = await http().post(T(semModeloId)).set(auth(lider)).send({ room_ids: [] });
    expect(res.status).toBe(201);
    expect(res.body.room_ids).toEqual([]);
  });

  it('422 com turma desativada; 404 com turma inexistente; 400 com id inválido ou repetido', async () => {
    expect((await http().post(T(celebrationId)).set(auth(lider)).send({ room_ids: [roomOff] })).status).toBe(422);
    expect((await http().post(T(celebrationId)).set(auth(lider)).send({ room_ids: ['00000000-0000-4000-8000-000000000000'] })).status).toBe(404);
    expect((await http().post(T(celebrationId)).set(auth(lider)).send({ room_ids: ['x'] })).status).toBe(400);
    expect((await http().post(T(celebrationId)).set(auth(lider)).send({ room_ids: [roomA, roomA] })).status).toBe(400);
  });

  it('403 para member e volunteer gravarem; volunteer lê; Starter leva 403', async () => {
    expect((await http().post(T(celebrationId)).set(auth(h.tokenFor('member'))).send({ room_ids: [] })).status).toBe(403);
    expect((await http().post(T(celebrationId)).set(auth(h.tokenFor('volunteer'))).send({ room_ids: [] })).status).toBe(403);
    expect((await http().get(T(celebrationId)).set(auth(h.tokenFor('volunteer')))).status).toBe(200);
    expect((await http().get(T(celebrationId)).set(auth(h.tokenT1('starter', 'tenant_admin')))).status).toBe(403);
  });

  it('404 para celebração de outro tenant e para id inexistente', async () => {
    expect((await http().get(T(celebrationId)).set(auth(h.tokenT1('premium', 'tenant_admin')))).status).toBe(404);
    expect((await http().get(T('00000000-0000-4000-8000-000000000000')).set(auth(lider))).status).toBe(404);
  });
});

describe('POST /celebrations/:id/kids-template/apply', () => {
  beforeAll(async () => {
    await http().post(T(celebrationId)).set(auth(lider)).send({ room_ids: [roomA, roomB] });
  });

  it('abre as turmas do modelo nas próximas instâncias: sem passado e sem cancelada', async () => {
    const res = await http().post(`${T(celebrationId)}/apply`).set(auth(lider)).send({});

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ instances: 3, created: 6, already_open: 0, skipped_rooms: 0 });
    const [past, d7, d14, cancelled, d60] = instances.map((i) => i.id);
    expect(await sessionsOf(past!)).toHaveLength(0);
    expect(await sessionsOf(cancelled!)).toHaveLength(0);
    for (const id of [d7!, d14!, d60!]) {
      const rooms = (await sessionsOf(id)).map((s) => s.room_id).sort();
      expect(rooms).toEqual([roomA, roomB].sort());
    }
  });

  it('aplicar de novo não duplica nem dá erro', async () => {
    const res = await http().post(`${T(celebrationId)}/apply`).set(auth(lider)).send({});
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ instances: 3, created: 0, already_open: 6, skipped_rooms: 0 });
    expect(await sessionsOf(instances[1]!.id)).toHaveLength(2);
  });

  it('respeita a janela e completa o que faltava', async () => {
    const d14 = instances[2]!;
    await admin.kidsSession.deleteMany({ where: { celebration_instance_id: d14.id, room_id: roomB } });

    const res = await http()
      .post(`${T(celebrationId)}/apply`)
      .set(auth(lider))
      .send({ date_from: d14.date.toISOString().slice(0, 10), date_to: d14.date.toISOString().slice(0, 10) });

    expect(res.body).toEqual({ instances: 1, created: 1, already_open: 1, skipped_rooms: 0 });
  });

  it('pula turma desativada depois do modelo gravado', async () => {
    await admin.kidsSession.deleteMany({ where: { celebration_instance_id: { in: instances.map((i) => i.id) } } });
    await admin.kidsRoom.update({ where: { id: roomB }, data: { is_active: false } });

    const res = await http().post(`${T(celebrationId)}/apply`).set(auth(lider)).send({});

    expect(res.body).toEqual({ instances: 3, created: 3, already_open: 0, skipped_rooms: 1 });
    expect((await sessionsOf(instances[1]!.id)).map((s) => s.room_id)).toEqual([roomA]);
    await admin.kidsRoom.update({ where: { id: roomB }, data: { is_active: true } });
  });

  it('422 sem modelo; 400 com data inválida; 403 para volunteer; 404 em outro tenant', async () => {
    expect((await http().post(`${T(semModeloId)}/apply`).set(auth(lider)).send({})).status).toBe(422);
    expect((await http().post(`${T(celebrationId)}/apply`).set(auth(lider)).send({ date_from: 'amanhã' })).status).toBe(400);
    expect((await http().post(`${T(celebrationId)}/apply`).set(auth(h.tokenFor('volunteer'))).send({})).status).toBe(403);
    expect((await http().post(`${T(celebrationId)}/apply`).set(auth(h.tokenT1('premium', 'tenant_admin'))).send({})).status).toBe(404);
  });
});
