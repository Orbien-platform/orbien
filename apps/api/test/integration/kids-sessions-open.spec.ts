/**
 * GET /kids/sessions/open por HTTP (T19e): as sessões kids ABERTAS de hoje na
 * congregação do token, para o responsável achar o `session_id` do check-in do
 * próprio filho. Roda como `app_user`, então o RLS está ligado.
 *
 * Roda em `teste2-church` (Premium); `teste1-church` entra como "outro tenant"
 * e como Starter. Apaga o que criou.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidsopen-${ts}`;
const URL = '/api/kids/sessions/open';

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
const accountIds: string[] = [];
const celebrationIds: string[] = [];
const ids = { roomA: '', roomB: '', sA: '', sB: '', sCancelled: '', sYesterday: '', sInstCancelled: '', otherT1: '' };
let tokenVolEscalada: string;
let tokenVolFora: string;
let tokenMember: string;

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
type Row = { session_id: string };
const sessionIds = (body: Row[]) => body.map((r) => r.session_id);

async function instance(date: Date, status: 'published' | 'cancelled' = 'published', t = scope) {
  const celebration = await admin.celebration.create({
    data: { ...t, name: `Culto ${tag} ${celebrationIds.length}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
  });
  celebrationIds.push(celebration.id);
  return admin.celebrationInstance.create({
    data: { ...t, celebration_id: celebration.id, scheduled_date: date, status },
  });
}

async function mkVolunteer(label: string) {
  const person = await admin.person.create({ data: { ...scope, full_name: `${label} ${tag}`, classification: 'member' } });
  const account = await admin.userAccount.create({
    data: { ...scope, person_id: person.id, email: `${label}-${ts}@kids-open.fake`, password_hash: 'x', is_active: true },
  });
  accountIds.push(account.id);
  const token = h.app.get(JwtService).sign({
    sub: account.id,
    email: account.email,
    tenant_id: scope.tenant_id,
    congregation_id: scope.congregation_id,
    roles: ['volunteer'],
    plan: 'premium',
  });
  return { personId: person.id, token };
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-open');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  tokenMember = h.tokenFor('member');

  const congregation = await admin.congregation.findUniqueOrThrow({ where: { id: scope.congregation_id }, select: { timezone: true } });
  const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: congregation.timezone }).format(d);
  const today = new Date(`${dayKey(new Date())}T00:00:00.000Z`);
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const room = async (name: string, min: number, max: number) =>
    admin.kidsRoom.create({ data: { ...scope, name: `${name} ${tag}`, min_age_months: min, max_age_months: max, allows_out_of_range: name === 'Livre' } });
  const a = await room('Maternal', 24, 47);
  const b = await room('Livre', 48, 71);
  ids.roomA = a.id;
  ids.roomB = b.id;
  const sess = (instanceId: string, roomId: string, status: 'open' | 'cancelled' = 'open') =>
    admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instanceId, room_id: roomId, status } });

  const iToday = await instance(today);
  ids.sB = (await sess(iToday.id, b.id)).id;
  ids.sA = (await sess(iToday.id, a.id)).id;
  const iToday2 = await instance(today);
  ids.sCancelled = (await sess(iToday2.id, a.id, 'cancelled')).id;
  const iYesterday = await instance(yesterday);
  ids.sYesterday = (await sess(iYesterday.id, a.id)).id;
  const iCancelled = await instance(today, 'cancelled');
  ids.sInstCancelled = (await sess(iCancelled.id, a.id)).id;

  // Sessão de hoje em OUTRO tenant: o member de teste2 não pode vê-la.
  const t1scope = { tenant_id: h.t1.tenantId, congregation_id: h.t1.congregationId };
  const t1cong = await admin.congregation.findUniqueOrThrow({ where: { id: t1scope.congregation_id }, select: { timezone: true } });
  const t1today = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: t1cong.timezone }).format(new Date())}T00:00:00.000Z`);
  const t1inst = await instance(t1today, 'published', t1scope);
  const t1room = await admin.kidsRoom.create({ data: { ...t1scope, name: `Outra ${tag}`, min_age_months: 0, max_age_months: 200 } });
  ids.otherT1 = (await admin.kidsSession.create({ data: { ...t1scope, celebration_instance_id: t1inst.id, room_id: t1room.id } })).id;

  // Voluntária escalada só na sessão A.
  const vol = await mkVolunteer('Escalada');
  tokenVolEscalada = vol.token;
  tokenVolFora = (await mkVolunteer('Fora')).token;
  const profile = await admin.volunteerProfile.create({ data: { ...scope, person_id: vol.personId, availability: {}, skills: [] } });
  const ministry = await admin.ministry.create({ data: { ...scope, name: `Kids ${tag}` } });
  const schedule = await admin.celebrationSchedule.create({ data: { ...scope, celebration_instance_id: iToday.id } });
  const cm = await admin.celebrationMinistry.create({
    data: { ...scope, schedule_id: schedule.id, ministry_id: ministry.id, kids_session_id: ids.sA },
  });
  await admin.celebrationAssignment.create({
    data: { ...scope, celebration_ministry_id: cm.id, volunteer_profile_id: profile.id, status: 'confirmed' },
  });
}, 120_000);

afterAll(async () => {
  await admin.celebration.deleteMany({ where: { id: { in: celebrationIds } } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.ministry.deleteMany({ where: { name: `Kids ${tag}` } });
  await admin.volunteerProfile.deleteMany({ where: { person: { full_name: { endsWith: tag } } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await admin.person.deleteMany({ where: { full_name: { endsWith: tag } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('GET /kids/sessions/open', () => {
  it('responsável (member) vê as sessões abertas de hoje, por idade, no contrato final e sem dado de criança', async () => {
    const res = await http().get(URL).set(auth(tokenMember));

    expect(res.status).toBe(200);
    const mine = res.body.filter((r: Row) => [ids.sA, ids.sB].includes(r.session_id));
    expect(sessionIds(mine)).toEqual([ids.sA, ids.sB]);
    expect(mine[0]).toEqual({
      session_id: ids.sA,
      status: 'open',
      room: { id: ids.roomA, name: `Maternal ${tag}`, min_age_months: 24, max_age_months: 47, allows_out_of_range: false },
      instance: {
        id: expect.any(String),
        scheduled_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/),
        celebration_name: expect.stringContaining(tag),
        start_time: '10:00',
      },
    });
    expect(mine[1].room.allows_out_of_range).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/child|allerg|medical|checkin|health/i);
  });

  it('fica de fora: sessão cancelada, culto de outro dia e instância cancelada', async () => {
    const res = await http().get(URL).set(auth(tokenMember));
    const got = sessionIds(res.body);
    for (const id of [ids.sCancelled, ids.sYesterday, ids.sInstCancelled]) expect(got).not.toContain(id);
  });

  it('gestão vê todas as do dia', async () => {
    const res = await http().get(URL).set(auth(h.tokenFor('ministry_leader')));
    expect(res.status).toBe(200);
    expect(sessionIds(res.body)).toEqual(expect.arrayContaining([ids.sA, ids.sB]));
  });

  it('isolamento: o member de teste2 não vê a sessão de teste1', async () => {
    const t1 = await http().get(URL).set(auth(h.tokenT1('premium', 'member')));
    expect(t1.status).toBe(200);
    expect(sessionIds(t1.body)).toContain(ids.otherT1);
    expect(sessionIds(t1.body)).not.toContain(ids.sA);

    const t2 = await http().get(URL).set(auth(tokenMember));
    expect(sessionIds(t2.body)).not.toContain(ids.otherT1);
  });

  it('volunteer vê só a sessão em que está escalado; sem escala, lista vazia', async () => {
    const mine = await http().get(URL).set(auth(tokenVolEscalada));
    expect(mine.status).toBe(200);
    expect(sessionIds(mine.body)).toEqual([ids.sA]);

    const none = await http().get(URL).set(auth(tokenVolFora));
    expect(none.status).toBe(200);
    expect(none.body).toEqual([]);
  });

  it('401 sem token; 403 no plano Starter e para papel fora da lista', async () => {
    expect((await http().get(URL)).status).toBe(401);
    expect((await http().get(URL).set(auth(h.tokenT1('starter', 'member')))).status).toBe(403);
    expect((await http().get(URL).set(auth(h.tokenFor('visitor')))).status).toBe(403);
  });

  it('a rota literal vence qualquer :id (não é lida como id de sessão)', async () => {
    // Se `open` fosse capturado por `kids/sessions/:id`, viria 400/404, nunca a lista.
    const res = await http().get(URL).set(auth(tokenMember));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
