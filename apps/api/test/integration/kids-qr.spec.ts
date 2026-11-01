/**
 * QR de check-in e de check-out do Kids por HTTP (R3-1), contra o Postgres com
 * RLS (rotas rodam como `app_user`). O QR é só um portador dos mesmos segredos:
 * o check-in lido por QR passa por TODAS as regras do check-in normal, e o QR
 * de check-out vale como o código digitado (mesmo contador de tentativas, mesma
 * recusa 403 genérica).
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
const tag = `kidsqr-${ts}`;
const QR_DENIED = 'Não foi possível validar o QR. Peça um novo ao responsável.';
const CHECKOUT_DENIED = 'Não foi possível confirmar a retirada. Chame o líder kids.';

let h: KidsHarness;
let scope: { tenant_id: string; congregation_id: string };
let leader: string;
let leaderAccountId: string;
let t1AccountId: string;
let tokenMae: string;
let tokenOutra: string;
let tokenVolFora: string;
let tokenGestor: string;
let mae: string;
let avo: string;
let tio: string;
let celebrationId: string;
let sMat: string;
let sBebe: string;
const accountIds: string[] = [];

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const issue = (token: string, childId: string) => http().post(`/api/kids/children/${childId}/qr`).set(auth(token));
const byQr = (token: string, sessionId: string, body: Record<string, unknown>) =>
  http().post(`/api/kids/sessions/${sessionId}/checkins/by-qr`).set(auth(token)).send(body);
const checkout = (id: string, body: Record<string, unknown>, token = leader) =>
  http().post(`/api/kids/checkins/${id}/checkout`).set(auth(token)).send(body);
const qrRow = (qr: string) => admin.kidsCheckinQrToken.findUniqueOrThrow({ where: { id: qr.split('.')[1]! } });
const attempts = async (id: string) =>
  (await admin.kidsCheckin.findUniqueOrThrow({ where: { id }, select: { checkout_failed_attempts: true } })).checkout_failed_attempts;

async function mkUser(label: string, roles: string[]) {
  const person = await admin.person.create({ data: { ...scope, full_name: `${label} ${tag}`, classification: 'member' } });
  const account = await admin.userAccount.create({
    data: { ...scope, person_id: person.id, email: `${label}-${ts}@kids-qr.fake`, password_hash: 'x', is_active: true },
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
  return { personId: person.id, token };
}

let childN = 0;
const monthsAgo = (m: number) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - m);
  d.setUTCDate(d.getUTCDate() - 3);
  return d;
};
/** Criança no Household da mãe; mãe primária, avó (retira), tio (não retira). */
async function mkChild(months = 36) {
  childN += 1;
  const household = await admin.household.create({ data: { ...scope, name: `Família ${tag} ${childN}` } });
  const child = await admin.person.create({
    data: {
      ...scope,
      full_name: `Criança ${childN} ${tag}`,
      is_child: true,
      classification: 'attendee',
      household_id: household.id,
      birth_date: monthsAgo(months),
    },
  });
  await admin.householdMember.createMany({
    data: [
      { household_id: household.id, person_id: mae, role: 'head' },
      { household_id: household.id, person_id: child.id, role: 'child' },
    ],
  });
  const g = (p: string, rel: string, can_pickup: boolean, is_primary: boolean) => ({
    ...scope, child_id: child.id, guardian_person_id: p, relationship: rel, can_pickup, is_primary,
  });
  await admin.kidsGuardian.createMany({ data: [g(mae, 'mãe', true, true), g(avo, 'avó', true, false), g(tio, 'tio', false, false)] });
  return child.id;
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-qr');
  scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  leader = h.tokenFor('ministry_leader');
  leaderAccountId = (h.app.get(JwtService).decode(leader) as { sub: string }).sub;
  t1AccountId = (h.app.get(JwtService).decode(h.tokenT1('premium', 'pastor')) as { sub: string }).sub;

  const m = await mkUser('Mae', ['member']);
  mae = m.personId;
  tokenMae = m.token;
  tokenOutra = (await mkUser('OutraMae', ['member'])).token;
  tokenVolFora = (await mkUser('VolFora', ['volunteer'])).token;
  tokenGestor = (await mkUser('Gestor', ['pastor'])).token; // gestão com cadastro de pessoa, fora da família
  avo = (await admin.person.create({ data: { ...scope, full_name: `Avo ${tag}`, classification: 'attendee' } })).id;
  tio = (await admin.person.create({ data: { ...scope, full_name: `Tio ${tag}`, classification: 'attendee' } })).id;
  await admin.consentRecord.create({
    data: { ...scope, person_id: mae, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
  });

  celebrationId = (
    await admin.celebration.create({
      data: { ...scope, name: `Culto ${tag}`, type: 'sunday_service', start_time: '10:00', recurrence: 'none' },
    })
  ).id;
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 120);
  const instance = await admin.celebrationInstance.create({
    data: { ...scope, celebration_id: celebrationId, scheduled_date: date, status: 'published' },
  });
  const rMat = await admin.kidsRoom.create({ data: { ...scope, name: `Maternal ${tag}`, min_age_months: 24, max_age_months: 47 } });
  const rBebe = await admin.kidsRoom.create({
    data: { ...scope, name: `Bebês ${tag}`, min_age_months: 0, max_age_months: 11, allows_out_of_range: true },
  });
  sMat = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance.id, room_id: rMat.id } })).id;
  const instance2 = await admin.celebrationInstance.create({
    data: { ...scope, celebration_id: celebrationId, scheduled_date: new Date(date.getTime() + 86_400_000), status: 'published' },
  });
  sBebe = (await admin.kidsSession.create({ data: { ...scope, celebration_instance_id: instance2.id, room_id: rBebe.id } })).id;
}, 120_000);

beforeEach(() => {
  jest.spyOn(h.app.get(NotificationsService), 'sendPushToPersons').mockResolvedValue(true);
  jest.spyOn(h.app.get(NotificationsService), 'sendPush').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());

afterAll(async () => {
  const persons = await admin.person.findMany({ where: { full_name: { endsWith: tag } }, select: { id: true, household_id: true } });
  const personIds = persons.map((p) => p.id);
  await admin.auditLog.deleteMany({ where: { OR: [{ subject_person_id: { in: personIds } }, { actor_user_id: { in: [leaderAccountId, t1AccountId, ...accountIds] } }] } });
  await admin.celebration.deleteMany({ where: { id: celebrationId } });
  await admin.kidsRoom.deleteMany({ where: { name: { endsWith: tag } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.household.deleteMany({ where: { id: { in: persons.map((p) => p.household_id).filter((x): x is string => !!x) } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('POST /kids/children/:id/qr — o responsável emite o QR de check-in', () => {
  it('201 com QR curto, uso único e preso à criança + responsável; só o HASH do segredo vai ao banco', async () => {
    const child = await mkChild();
    const res = await issue(tokenMae, child);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ child_id: child, guardian_person_id: mae, ttl_seconds: 300 });
    expect(res.body.qr).toMatch(/^kidsci1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    const ttl = new Date(res.body.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(250_000);
    expect(ttl).toBeLessThanOrEqual(300_000);

    const row = await qrRow(res.body.qr);
    expect(row).toMatchObject({ child_id: child, guardian_person_id: mae, used_at: null });
    expect(JSON.stringify(row)).not.toContain(res.body.qr.split('.')[2]);
  });

  it('só o responsável do próprio Household: outra mãe e a gestão fora da família recebem 404; voluntário 403', async () => {
    const child = await mkChild();
    expect((await issue(tokenOutra, child)).status).toBe(404);
    expect((await issue(tokenGestor, child)).status).toBe(404); // gestão sem vínculo de Household: sem atalho
    expect((await issue(tokenVolFora, child)).status).toBe(403);
    expect((await http().post(`/api/kids/children/${child}/qr`)).status).toBe(401);
    expect(await admin.kidsCheckinQrToken.count({ where: { child_id: child } })).toBe(0);
  });

  it('emitir de novo invalida o QR anterior ainda não usado', async () => {
    const child = await mkChild();
    const a = await issue(tokenMae, child);
    const b = await issue(tokenMae, child);
    expect((await byQr(leader, sMat, { qr: a.body.qr })).status).toBe(403);
    expect((await byQr(leader, sMat, { qr: b.body.qr })).status).toBe(201);
  });

  it('409 quando a criança já está presente', async () => {
    const child = await mkChild();
    expect((await http().post(`/api/kids/sessions/${sMat}/checkins`).set(auth(leader)).send({ child_id: child, guardian_person_id: mae })).status).toBe(201);
    expect((await issue(tokenMae, child)).status).toBe(409);
  });
});

describe('POST /kids/sessions/:id/checkins/by-qr — a equipe lê o QR', () => {
  it('check-in com guardian = quem emitiu, checked_in_by = quem leu, código novo e etiquetas; QR consumido', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    const res = await byQr(leader, sMat, { qr: issued.qr });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ session_id: sMat, child_id: child, guardian_person_id: mae, checked_in_by: leaderAccountId, age_override: false });
    expect(res.body.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    expect(res.body.labels.child_label.code).toBe(res.body.code);
    expect(JSON.stringify(res.body)).not.toContain(issued.qr.split('.')[2]);

    const row = await admin.kidsCheckin.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ guardian_person_id: mae, checked_in_by: leaderAccountId, checked_out_at: null });
    expect((await qrRow(issued.qr)).used_at).not.toBeNull();
    expect((await qrRow(issued.qr)).used_by).toBe(leaderAccountId);
  });

  it('uso único: ler o mesmo QR de novo dá 403 genérico', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    expect((await byQr(leader, sMat, { qr: issued.qr })).status).toBe(201);
    const again = await byQr(leader, sMat, { qr: issued.qr });
    expect(again.status).toBe(403);
    expect(again.body.message).toBe(QR_DENIED);
  });

  it('expirado, forjado, de formato errado e inexistente: o MESMO 403, sem dizer o motivo', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    const [prefix, id] = issued.qr.split('.');
    await admin.kidsCheckinQrToken.update({ where: { id: id! }, data: { expires_at: new Date(Date.now() - 1000) } });
    const expired = await byQr(leader, sMat, { qr: issued.qr });

    const live = await issue(tokenMae, child);
    const forged = await byQr(leader, sMat, { qr: `${prefix}.${live.body.qr.split('.')[1]}.${'A'.repeat(43)}` });
    const garbage = await byQr(leader, sMat, { qr: 'qualquer-coisa' });
    const ghost = await byQr(leader, sMat, { qr: `kidsci1.00000000-0000-4000-8000-000000000000.${'A'.repeat(43)}` });
    const checkoutQr = await byQr(leader, sMat, { qr: `kidsco1.${id}.A2B3.${'A'.repeat(43)}` });

    for (const res of [expired, forged, garbage, ghost, checkoutQr]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(expired.body);
      expect(res.body.message).toBe(QR_DENIED);
    }
    // O QR legítimo continua valendo depois de tentativas forjadas.
    expect((await byQr(leader, sMat, { qr: live.body.qr })).status).toBe(201);
  });

  it('a recusa fica na auditoria com o motivo (que a resposta não revela)', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    await byQr(leader, sMat, { qr: issued.qr });
    await byQr(leader, sMat, { qr: issued.qr });
    const logs = await admin.auditLog.findMany({ where: { action: 'kids.checkin_qr_denied', actor_user_id: leaderAccountId }, orderBy: { at: 'desc' }, take: 1 });
    expect(logs[0]!.after).toMatchObject({ session_id: sMat, reason: 'used' });
    expect(JSON.stringify(logs[0]!.after)).not.toContain(issued.qr.split('.')[2]);
  });

  it('passa pelas regras do check-in: 409 se já presente — e a leitura é desfeita (QR segue válido)', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    expect((await http().post(`/api/kids/sessions/${sMat}/checkins`).set(auth(leader)).send({ child_id: child, guardian_person_id: mae })).status).toBe(201);
    expect((await byQr(leader, sMat, { qr: issued.qr })).status).toBe(409);
    expect((await qrRow(issued.qr)).used_at).toBeNull();
  });

  it('passa pelas regras: fora da faixa pede confirmação (422) sem queimar o QR; confirmado, grava age_override', async () => {
    const child = await mkChild(36); // Bebês é 0-11 e aceita fora da faixa
    const { body: issued } = await issue(tokenMae, child);
    const ask = await byQr(leader, sBebe, { qr: issued.qr });
    expect(ask.status).toBe(422);
    expect(ask.body.code).toBe('OUT_OF_RANGE_CONFIRM');
    expect((await qrRow(issued.qr)).used_at).toBeNull();

    const ok = await byQr(leader, sBebe, { qr: issued.qr, confirm_out_of_range: true });
    expect(ok.status).toBe(201);
    expect(ok.body.age_override).toBe(true);
  });

  it('passa pelas regras: sem consentimento vigente do responsável primário, 422 e QR intacto', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    await admin.consentRecord.updateMany({ where: { person_id: mae, origin: 'kids' }, data: { revoked_at: new Date() } });
    try {
      const res = await byQr(leader, sMat, { qr: issued.qr });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('kids_consent_required');
      expect((await qrRow(issued.qr)).used_at).toBeNull();
    } finally {
      await admin.consentRecord.updateMany({ where: { person_id: mae, origin: 'kids' }, data: { revoked_at: null } });
    }
  });

  it('passa pelas regras: responsável removido da lista depois de emitir o QR = 422', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    await admin.kidsGuardian.updateMany({ where: { child_id: child, guardian_person_id: mae }, data: { is_primary: false } });
    await admin.kidsGuardian.updateMany({ where: { child_id: child, guardian_person_id: avo }, data: { is_primary: true } });
    await admin.kidsGuardian.deleteMany({ where: { child_id: child, guardian_person_id: mae } });
    const res = await byQr(leader, sMat, { qr: issued.qr });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('kids_guardian_not_authorized');
  });

  it('sessão cancelada = 422 e QR intacto', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    await admin.kidsSession.update({ where: { id: sMat }, data: { status: 'cancelled' } });
    try {
      expect((await byQr(leader, sMat, { qr: issued.qr })).status).toBe(422);
      expect((await qrRow(issued.qr)).used_at).toBeNull();
    } finally {
      await admin.kidsSession.update({ where: { id: sMat }, data: { status: 'open' } });
    }
  });

  it('papéis: o responsável não lê QR (403) e voluntário não escalado também; nada é consumido', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    expect((await byQr(tokenMae, sMat, { qr: issued.qr })).status).toBe(403);
    expect((await byQr(tokenVolFora, sMat, { qr: issued.qr })).status).toBe(403);
    expect((await http().post(`/api/kids/sessions/${sMat}/checkins/by-qr`).send({ qr: issued.qr })).status).toBe(401);
    expect((await qrRow(issued.qr)).used_at).toBeNull();
  });

  it('400 sem qr ou com campo que o servidor decide (criança/responsável vêm do QR)', async () => {
    expect((await byQr(leader, sMat, {})).status).toBe(400);
    expect((await byQr(leader, sMat, { qr: 'x', child_id: 'c' })).status).toBe(400);
    expect((await byQr(leader, sMat, { qr: 'x', guardian_person_id: 'g' })).status).toBe(400);
  });

  it('QR de outra congregação/tenant não vale (RLS): leitor do teste1 recebe 403', async () => {
    const child = await mkChild();
    const { body: issued } = await issue(tokenMae, child);
    const res = await http()
      .post(`/api/kids/sessions/${sMat}/checkins/by-qr`)
      .set(auth(h.tokenT1('premium', 'ministry_leader')))
      .send({ qr: issued.qr });
    expect(res.status).toBe(403);
    expect((await qrRow(issued.qr)).used_at).toBeNull();
  });

  it('concorrência: duas leituras simultâneas do mesmo QR dão um 201 e um 403', async () => {
    for (let round = 0; round < 3; round++) {
      const child = await mkChild();
      const { body: issued } = await issue(tokenMae, child);
      const results = await Promise.all([byQr(leader, sMat, { qr: issued.qr }), byQr(leader, sMat, { qr: issued.qr })]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 403]);
      expect(await admin.kidsCheckin.count({ where: { child_id: child, checked_out_at: null } })).toBe(1);
    }
  });
});

describe('check-out por QR (a tela do código do responsável)', () => {
  async function present() {
    const child = await mkChild();
    const res = await http().post(`/api/kids/sessions/${sMat}/checkins`).set(auth(leader)).send({ child_id: child, guardian_person_id: mae });
    expect(res.status).toBe(201);
    const view = await http().get(`/api/kids/children/${child}/checkin`).set(auth(tokenMae));
    expect(view.status).toBe(200);
    return { child, id: res.body.id as string, code: res.body.code as string, qr: view.body.qr as string };
  }

  it('GET /kids/children/:id/checkin devolve também o qr, com o mesmo código embutido de forma verificável', async () => {
    const c = await present();
    expect(c.qr).toMatch(/^kidsco1\.[0-9a-f-]{36}\.[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}\.[A-Za-z0-9_-]{43}$/);
    const [, id, code] = c.qr.split('.');
    expect(id).toBe(c.id);
    expect(code).toBe(c.code);
  });

  it('a equipe lê o QR: fecha como o código digitado — quem retirou, quem conferiu, check-in fechado', async () => {
    const c = await present();
    const res = await checkout(c.id, { qr: c.qr, picked_up_by_person_id: mae });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: c.id, picked_up_by_person_id: mae, checked_out_by: leaderAccountId });
    const row = await admin.kidsCheckin.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.checked_out_at).not.toBeNull();
    expect((await checkout(c.id, { qr: c.qr, picked_up_by_person_id: mae })).status).toBe(409);
  });

  it('QR válido não dispensa can_pickup: tio (sem permissão) leva o 403 genérico idêntico ao do código errado', async () => {
    const c = await present();
    const wrong = await checkout(c.id, { code: c.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ', picked_up_by_person_id: mae });
    const noPickup = await checkout(c.id, { qr: c.qr, picked_up_by_person_id: tio });
    expect(noPickup.status).toBe(403);
    expect(noPickup.body).toEqual(wrong.body);
    expect(noPickup.body.message).toBe(CHECKOUT_DENIED);
    expect((await admin.kidsCheckin.findUniqueOrThrow({ where: { id: c.id } })).checked_out_at).toBeNull();
  });

  it('QR forjado, de OUTRO check-in ou adulterado: o mesmo 403, auditado e contado como tentativa errada', async () => {
    const a = await present();
    const b = await present();
    const wrong = await checkout(a.id, { code: a.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ', picked_up_by_person_id: mae });
    expect(await attempts(a.id)).toBe(1);

    const fromB = await checkout(a.id, { qr: b.qr, picked_up_by_person_id: mae });
    const forged = await checkout(a.id, { qr: `kidsco1.${a.id}.${a.code}.${'A'.repeat(43)}`, picked_up_by_person_id: mae });
    const tampered = await checkout(a.id, { qr: a.qr.replace(a.code, a.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ'), picked_up_by_person_id: mae });
    for (const res of [fromB, forged, tampered]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual(wrong.body);
    }
    expect(await attempts(a.id)).toBe(4);
    expect((await admin.kidsCheckin.findUniqueOrThrow({ where: { id: a.id } })).checked_out_at).toBeNull();
    const denied = await admin.auditLog.count({ where: { action: 'kids.checkout_denied', after: { path: ['checkin_id'], equals: a.id } } });
    expect(denied).toBe(4);
  });

  it('QR conta no limite de 5: 5 QRs forjados travam; depois nem o QR verdadeiro fecha, só o override', async () => {
    const c = await present();
    for (let i = 0; i < 5; i++) {
      expect((await checkout(c.id, { qr: `kidsco1.${c.id}.${c.code}.${'B'.repeat(43)}`, picked_up_by_person_id: mae })).status).toBe(403);
    }
    expect(await attempts(c.id)).toBe(5);
    const real = await checkout(c.id, { qr: c.qr, picked_up_by_person_id: mae });
    expect(real.status).toBe(403);
    expect(real.body.message).toBe(CHECKOUT_DENIED);
    const override = await http()
      .post(`/api/kids/checkins/${c.id}/checkout-override`)
      .set(auth(leader))
      .send({ reason: 'Conferi o documento da mãe', picked_up_by_name: `Mae ${tag}` });
    expect(override.status).toBe(200);
  });

  it('400: código e qr juntos, ou nenhum dos dois', async () => {
    const c = await present();
    expect((await checkout(c.id, { code: c.code, qr: c.qr, picked_up_by_person_id: mae })).status).toBe(400);
    expect((await checkout(c.id, { picked_up_by_person_id: mae })).status).toBe(400);
    expect(await attempts(c.id)).toBe(0);
  });

  it('o responsável continua sem poder fechar o próprio check-in, nem com o próprio QR', async () => {
    const c = await present();
    expect((await checkout(c.id, { qr: c.qr, picked_up_by_person_id: mae }, tokenMae)).status).toBe(403);
    expect((await admin.kidsCheckin.findUniqueOrThrow({ where: { id: c.id } })).checked_out_at).toBeNull();
  });
});
