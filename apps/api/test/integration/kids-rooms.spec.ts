/**
 * Turmas do Kids por HTTP (spec "Turmas e sessões por culto", AC 1 e 2),
 * contra o Postgres com RLS (rotas rodam como `app_user`).
 *
 * Roda em `teste2-church` (Premium) e `teste1-church` (Starter, para o gate
 * de plano e o isolamento entre tenants) e apaga o que criou.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const name = (n: string) => `${n} rooms-${ts}`;
let h: KidsHarness;
let lider: string;

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const body = (extra: Record<string, unknown> = {}) => ({
  name: name('Maternal'),
  min_age_months: 24,
  max_age_months: 47,
  ...extra,
});

beforeAll(async () => {
  h = await bootKids(admin, 'kids-rooms');
  lider = h.tokenFor('ministry_leader');
}, 120_000);

afterAll(async () => {
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: `rooms-${ts}` } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('POST /kids/rooms', () => {
  it('cria a turma na congregação do usuário, com padrões', async () => {
    const res = await http().post('/api/kids/rooms').set(auth(lider)).send(body());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: name('Maternal'),
      min_age_months: 24,
      max_age_months: 47,
      allows_out_of_range: false,
      capacity: null,
      min_volunteers: 0,
      is_active: true,
      tenant_id: h.t2.tenantId,
      congregation_id: h.t2.congregationId,
    });
  });

  it('aceita allows_out_of_range, capacidade e mínimo de voluntários', async () => {
    const res = await http()
      .post('/api/kids/rooms')
      .set(auth(h.tokenFor('secretary')))
      .send(body({ name: name('Berçário'), allows_out_of_range: true, capacity: 8, min_volunteers: 2 }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ allows_out_of_range: true, capacity: 8, min_volunteers: 2 });
  });

  it.each([
    ['faixa ausente', { min_age_months: undefined, max_age_months: undefined }],
    ['só o mínimo', { max_age_months: undefined }],
    ['min > max', { min_age_months: 60, max_age_months: 24 }],
    ['valor negativo', { min_age_months: -1 }],
  ])('400 com %s', async (_label, extra) => {
    const res = await http().post('/api/kids/rooms').set(auth(lider)).send(body(extra));
    expect(res.status).toBe(400);
  });

  it('400 quando o corpo tenta escolher a congregação', async () => {
    const res = await http()
      .post('/api/kids/rooms')
      .set(auth(lider))
      .send(body({ congregation_id: h.t1.congregationId }));
    expect(res.status).toBe(400);
  });

  it.each(['member', 'volunteer', 'cell_leader', 'treasurer'])('403 para %s', async (role) => {
    const res = await http().post('/api/kids/rooms').set(auth(h.tokenFor(role))).send(body());
    expect(res.status).toBe(403);
  });

  it('403 no tenant Starter (gate Premium)', async () => {
    const res = await http().post('/api/kids/rooms').set(auth(h.tokenT1('starter', 'tenant_admin'))).send(body());
    expect(res.status).toBe(403);
  });

  it('401 sem token', async () => {
    expect((await http().post('/api/kids/rooms').send(body())).status).toBe(401);
  });
});

describe('GET /kids/rooms', () => {
  let ids: Record<string, string>;

  beforeAll(async () => {
    const mk = async (n: string, min: number, max: number) =>
      (await http().post('/api/kids/rooms').set(auth(lider)).send(body({ name: name(n), min_age_months: min, max_age_months: max }))).body.id;
    ids = { junior: await mk('Júnior', 72, 119), bebes: await mk('Bebês', 0, 11), teens: await mk('Teens', 120, 155) };
    await http().delete(`/api/kids/rooms/${ids['teens']}`).set(auth(lider));
  });

  const mine = (rooms: { name: string }[]) =>
    rooms.filter((r) => r.name.endsWith(`rooms-${ts}`)).map((r) => r.name.split(' ')[0]);

  it('lista ordenada por idade mínima e sem as desativadas', async () => {
    const res = await http().get('/api/kids/rooms').set(auth(lider));
    expect(res.status).toBe(200);
    const names = mine(res.body);
    expect(names.indexOf('Bebês')).toBeLessThan(names.indexOf('Maternal'));
    expect(names.indexOf('Maternal')).toBeLessThan(names.indexOf('Júnior'));
    expect(names).not.toContain('Teens');
  });

  it('inclui as desativadas com include_inactive=true', async () => {
    const res = await http().get('/api/kids/rooms?include_inactive=true').set(auth(lider));
    expect(res.status).toBe(200);
    expect(mine(res.body)).toContain('Teens');
  });

  it('voluntário lê o catálogo', async () => {
    expect((await http().get('/api/kids/rooms').set(auth(h.tokenFor('volunteer')))).status).toBe(200);
  });

  it('403 para quem não é equipe', async () => {
    expect((await http().get('/api/kids/rooms').set(auth(h.tokenFor('member')))).status).toBe(403);
  });

  it('não vaza turma de outro tenant', async () => {
    // Token do teste1 afirmando Premium só para passar o PlanGuard: quem
    // isola é o RLS.
    const res = await http().get('/api/kids/rooms?include_inactive=true').set(auth(h.tokenT1('premium', 'tenant_admin')));
    expect(res.status).toBe(200);
    expect(mine(res.body)).toEqual([]);
  });
});

describe('GET/PATCH/DELETE /kids/rooms/:id', () => {
  let id: string;

  beforeAll(async () => {
    id = (await http().post('/api/kids/rooms').set(auth(lider)).send(body({ name: name('Edição') }))).body.id;
  });

  it('GET devolve a turma', async () => {
    const res = await http().get(`/api/kids/rooms/${id}`).set(auth(lider));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('404 para id inexistente e para turma de outro tenant', async () => {
    expect((await http().get('/api/kids/rooms/00000000-0000-4000-8000-000000000000').set(auth(lider))).status).toBe(404);
    const other = await http().get(`/api/kids/rooms/${id}`).set(auth(h.tokenT1('premium', 'tenant_admin')));
    expect(other.status).toBe(404);
  });

  it('PATCH altera só o enviado e persiste', async () => {
    const res = await http().patch(`/api/kids/rooms/${id}`).set(auth(lider)).send({ allows_out_of_range: true, capacity: 10 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ allows_out_of_range: true, capacity: 10, min_age_months: 24, max_age_months: 47 });
    const row = await admin.kidsRoom.findUniqueOrThrow({ where: { id } });
    expect(row.capacity).toBe(10);
  });

  it('PATCH com capacity null remove o limite', async () => {
    const res = await http().patch(`/api/kids/rooms/${id}`).set(auth(lider)).send({ capacity: null });
    expect(res.status).toBe(200);
    expect(res.body.capacity).toBeNull();
  });

  it('PATCH 400 quando o min novo passa do max gravado', async () => {
    const res = await http().patch(`/api/kids/rooms/${id}`).set(auth(lider)).send({ min_age_months: 100 });
    expect(res.status).toBe(400);
  });

  it('PATCH 403 para volunteer', async () => {
    const res = await http().patch(`/api/kids/rooms/${id}`).set(auth(h.tokenFor('volunteer'))).send({ name: 'x' });
    expect(res.status).toBe(403);
  });

  it('DELETE desativa sem apagar, e PATCH is_active reativa', async () => {
    const del = await http().delete(`/api/kids/rooms/${id}`).set(auth(lider));
    expect(del.status).toBe(200);
    expect(del.body.is_active).toBe(false);
    expect(await admin.kidsRoom.count({ where: { id } })).toBe(1);

    const back = await http().patch(`/api/kids/rooms/${id}`).set(auth(lider)).send({ is_active: true });
    expect(back.body.is_active).toBe(true);
  });

  it('DELETE 403 para volunteer e 404 em turma de outro tenant', async () => {
    expect((await http().delete(`/api/kids/rooms/${id}`).set(auth(h.tokenFor('volunteer')))).status).toBe(403);
    expect((await http().delete(`/api/kids/rooms/${id}`).set(auth(h.tokenT1('premium', 'tenant_admin')))).status).toBe(404);
  });
});
