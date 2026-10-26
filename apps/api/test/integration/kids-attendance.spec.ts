/**
 * Contagem de público derivada do check-in (spec P2 "Escala e contagem", AC 3 e
 * 4) e indicador de presença kids por turma (spec P3), por HTTP, contra o
 * Postgres com RLS. Os check-ins são gravados direto: o que se prova aqui é a
 * LEITURA (check-in e check-out por HTTP já têm kids-checkin.spec.ts).
 *
 * Roda em `teste2-church` (Premium); `teste1-church` entra só como "outro
 * tenant". Apaga o que criou.
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidsatt-${ts}`;

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let accountId: string;
const ids = {
  celebration: '', iSemCheckin: '', iCom3: '', iCom1: '', iAntigo: '', iVazio: '',
  rA: '', rB: '', c1: '', c2: '', c3: '', guardian: '',
};
const sessions: Record<string, string> = {};

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

let codeN = 0;
async function checkin(session: string, instance: string, child: string, closed = false) {
  codeN += 1;
  return admin.kidsCheckin.create({
    data: {
      ...scope,
      session_id: session,
      celebration_instance_id: instance,
      child_id: child,
      guardian_person_id: ids.guardian,
      code: `C${String(codeN).padStart(3, '0')}`,
      checked_in_by: accountId,
      ...(closed ? { checked_out_at: new Date(), checked_out_by: accountId } : {}),
    },
  });
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-attendance');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  accountId = (h.app.get(JwtService).decode(h.tokenFor('pastor')) as { sub: string }).sub;

  const person = (name: string, is_child: boolean) =>
    admin.person.create({ data: { ...scope, full_name: `${name} ${tag}`, is_child, classification: is_child ? 'attendee' : 'member' } });
  ids.guardian = (await person('Responsavel', false)).id;
  ids.c1 = (await person('Crianca1', true)).id;
  ids.c2 = (await person('Crianca2', true)).id;
  ids.c3 = (await person('Crianca3', true)).id;

  ids.celebration = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto kids-attendance ${ts}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  const inst = async (ago: number) =>
    (await admin.celebrationInstance.create({
      data: { ...scope, celebration_id: ids.celebration, scheduled_date: daysAgo(ago), status: 'published' },
    })).id;
  ids.iVazio = await inst(24); // sessão aberta, ninguém fez check-in
  ids.iCom1 = await inst(17);
  ids.iCom3 = await inst(10);
  ids.iSemCheckin = await inst(3); // culto sem sessão kids
  ids.iAntigo = await inst(200); // fora da janela padrão de 90 dias

  const room = (name: string, min: number, max: number) =>
    admin.kidsRoom.create({ data: { ...scope, name: `${name} ${tag}`, min_age_months: min, max_age_months: max } });
  ids.rA = (await room('Maternal', 24, 47)).id;
  ids.rB = (await room('Bebês', 0, 11)).id;
  const sess = async (name: string, instance: string, roomId: string) => {
    sessions[name] = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance, room_id: roomId } })).id;
  };
  await sess('A_vazio', ids.iVazio, ids.rA);
  await sess('A_com1', ids.iCom1, ids.rA);
  await sess('A_com3', ids.iCom3, ids.rA);
  await sess('B_com3', ids.iCom3, ids.rB);
  await sess('A_antigo', ids.iAntigo, ids.rA);

  // iCom3: c1 passou pela turma A (já retirado) e foi para a B; c2 ficou na A; c3 na B.
  // Distintos no culto = 3 (c1 conta uma vez, mesmo com dois check-ins).
  await checkin(sessions['A_com3']!, ids.iCom3, ids.c1, true);
  await checkin(sessions['A_com3']!, ids.iCom3, ids.c2);
  await checkin(sessions['B_com3']!, ids.iCom3, ids.c1);
  await checkin(sessions['B_com3']!, ids.iCom3, ids.c3);
  // iCom1: uma criança só.
  await checkin(sessions['A_com1']!, ids.iCom1, ids.c1);
  // iAntigo: fora do período padrão de 90 dias.
  await checkin(sessions['A_antigo']!, ids.iAntigo, ids.c1);
  await checkin(sessions['A_antigo']!, ids.iAntigo, ids.c2);
}, 120_000);

afterAll(async () => {
  const persons = await admin.person.findMany({ where: { full_name: { endsWith: tag } }, select: { id: true } });
  await admin.celebration.deleteMany({ where: { id: ids.celebration } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.person.deleteMany({ where: { id: { in: persons.map((p) => p.id) } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('GET /celebrations/attendance: checkin_total (KIDS-11)', () => {
  const list = (token: string) =>
    http().get('/api/celebrations/attendance').query({ celebration_id: ids.celebration }).set(auth(token));
  type Row = { celebration_instance_id: string; checkin_total: number; attendance: { children: number } | null };
  const byInstance = (rows: Row[], id: string) => rows.find((r) => r.celebration_instance_id === id)!;

  it('AC 3: cada culto traz as crianças DISTINTAS com check-in (aberto ou fechado), 0 quando não há', async () => {
    const res = await list(h.tokenFor('pastor'));
    expect(res.status).toBe(200);
    expect(byInstance(res.body, ids.iCom3).checkin_total).toBe(3);
    expect(byInstance(res.body, ids.iCom1).checkin_total).toBe(1);
    expect(byInstance(res.body, ids.iVazio).checkin_total).toBe(0); // sessão sem check-in
    expect(byInstance(res.body, ids.iSemCheckin).checkin_total).toBe(0); // sem sessão kids
    // Sem lançamento, `children` não é preenchido sozinho: continua manual.
    expect(byInstance(res.body, ids.iCom3).attendance).toBeNull();
  });

  it('AC 4: o valor lançado à mão é guardado e o total de check-ins fica ao lado', async () => {
    const put = await http()
      .put(`/api/celebrations/instances/${ids.iCom3}/attendance`)
      .set(auth(h.tokenFor('pastor')))
      .send({ children: 5, members: 40, attendees: 2, visitors: 1 });
    expect(put.status).toBe(200);
    // Contrato do PUT inalterado: devolve o que foi lançado.
    expect(put.body).toMatchObject({ celebration_instance_id: ids.iCom3, children: 5, total: 48 });

    const res = await list(h.tokenFor('pastor'));
    expect(byInstance(res.body, ids.iCom3)).toMatchObject({ checkin_total: 3, attendance: { children: 5 } });
  });

  it('sem check-in o PUT segue manual: aceita o valor lançado', async () => {
    const put = await http()
      .put(`/api/celebrations/instances/${ids.iSemCheckin}/attendance`)
      .set(auth(h.tokenFor('secretary')))
      .send({ children: 4, members: 0, attendees: 0, visitors: 0 });
    expect(put.status).toBe(200);
    expect(put.body.children).toBe(4);
    const res = await list(h.tokenFor('pastor'));
    expect(byInstance(res.body, ids.iSemCheckin)).toMatchObject({ checkin_total: 0, attendance: { children: 4 } });
  });

  it('403 para volunteer e member na leitura; 400 com celebration_id inválido', async () => {
    expect((await list(h.tokenFor('volunteer'))).status).toBe(403);
    expect((await list(h.tokenFor('member'))).status).toBe(403);
    const bad = await http().get('/api/celebrations/attendance').query({ celebration_id: 'x' }).set(auth(h.tokenFor('pastor')));
    expect(bad.status).toBe(400);
  });

  it('isolamento: check-in de um tenant não entra no total de outro', async () => {
    // Token do teste1 (Premium afirmado): não enxerga o culto do teste2, nem seu total.
    const res = await http()
      .get('/api/celebrations/attendance')
      .query({ celebration_id: ids.celebration })
      .set(auth(h.tokenT1('premium', 'pastor')));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
