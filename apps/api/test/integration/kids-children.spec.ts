/**
 * Criança, responsáveis e consentimento do Kids por HTTP (spec "Cadastro de
 * criança e responsáveis", AC 1-7; AD-013), contra o Postgres com RLS (as rotas
 * rodam como `app_user`).
 *
 * Roda em `teste2-church` (Premium) e `teste1-church` (Starter: gate de plano e
 * "outro tenant" do isolamento) e apaga o que criou.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { bootKids, type KidsHarness } from '../helpers/kids-app';
import { KIDS_TERM_VERSION } from '../../src/kids/consent/kids-consent.terms';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });
const ts = Date.now();
const tag = `kidsch-${ts}`;
const name = (n: string) => `${n} ${tag}`;
const ALERGIA = `amendoim-${ts}`;

let h: KidsHarness;
let tokenA: string; // responsável A
let tokenB: string; // responsável B
let secretaria: string;
let pastor: string;
let personA: string;
let personB: string;
const accountIds: string[] = [];

const http = () => request(h.app.getHttpServer());
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const birth = (years: number) => new Date(Date.now() - years * 365.25 * 86_400_000).toISOString();
const childBody = (extra: Record<string, unknown> = {}) => ({
  full_name: name('Ana'),
  birth_date: birth(4),
  allergies: ALERGIA,
  relationship: 'mãe',
  ...extra,
});

async function accept(token: string, extra: Record<string, unknown> = {}) {
  return http().post('/api/kids/consent').set(auth(token)).send({ term_version: KIDS_TERM_VERSION, ...extra });
}

beforeAll(async () => {
  h = await bootKids(admin, 'kids-children');
  const scope = { tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId };
  const jwt = h.app.get(JwtService);

  const mk = async (label: string) => {
    const person = await admin.person.create({
      data: { ...scope, full_name: name(label), classification: 'member' },
    });
    const account = await admin.userAccount.create({
      data: { ...scope, person_id: person.id, email: `${label}-${ts}@kids-children.fake`, password_hash: 'x', is_active: true },
    });
    accountIds.push(account.id);
    const token = jwt.sign({
      sub: account.id,
      email: account.email,
      ...{ tenant_id: h.t2.tenantId, congregation_id: h.t2.congregationId },
      roles: ['member'],
      plan: 'premium',
    });
    return { personId: person.id, token };
  };
  const a = await mk('RespA');
  const b = await mk('RespB');
  personA = a.personId;
  tokenA = a.token;
  personB = b.personId;
  tokenB = b.token;
  secretaria = h.tokenFor('secretary');
  pastor = h.tokenFor('pastor');
}, 120_000);

afterAll(async () => {
  const persons = await admin.person.findMany({
    where: { full_name: { endsWith: tag } },
    select: { id: true, household_id: true },
  });
  const personIds = persons.map((p) => p.id);
  const householdIds = persons.map((p) => p.household_id).filter((x): x is string => !!x);
  await admin.auditLog.deleteMany({ where: { subject_person_id: { in: personIds } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.household.deleteMany({ where: { id: { in: householdIds } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await h?.close();
  await admin.$disconnect();
}, 60_000);

describe('POST /kids/consent e GET /kids/consent', () => {
  it('GET informa que não há consentimento e devolve o termo vigente', async () => {
    const res = await http().get('/api/kids/consent').set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: false, term_version: KIDS_TERM_VERSION });
    expect(typeof res.body.term_text).toBe('string');
  });

  it('400 sem a versão do termo', async () => {
    const res = await http().post('/api/kids/consent').set(auth(tokenA)).send({});
    expect(res.status).toBe(400);
  });

  it('409 com versão desatualizada, trazendo o termo vigente', async () => {
    const res = await http().post('/api/kids/consent').set(auth(tokenA)).send({ term_version: 'kids-antigo' });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'kids_term_outdated', term_version: KIDS_TERM_VERSION });
  });

  it('403 para responsável tentando aceitar por outra pessoa', async () => {
    const res = await accept(tokenA, { guardian_person_id: personB });
    expect(res.status).toBe(403);
  });

  it('403 para papel fora da lista (volunteer) e para plano Starter', async () => {
    const volunteer = await accept(h.tokenFor('volunteer'));
    const starter = await http()
      .post('/api/kids/consent')
      .set(auth(h.tokenT1('starter', 'member')))
      .send({ term_version: KIDS_TERM_VERSION });

    expect(volunteer.status).toBe(403);
    expect(starter.status).toBe(403);
  });

  it('401 sem token', async () => {
    const res = await http().post('/api/kids/consent').send({ term_version: KIDS_TERM_VERSION });
    expect(res.status).toBe(401);
  });

  it('o responsável aceita: grava origin kids com a versão; repetir não duplica', async () => {
    const first = await accept(tokenA);
    const again = await accept(tokenA);

    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ valid: true, origin: 'kids', version: KIDS_TERM_VERSION });
    expect(again.status).toBe(201);
    expect(await admin.consentRecord.count({ where: { person_id: personA, origin: 'kids' } })).toBe(1);
    const status = await http().get('/api/kids/consent').set(auth(tokenA));
    expect(status.body.valid).toBe(true);
  });
});

describe('POST /kids/children', () => {
  it('422 sem consentimento vigente: traz versão e texto do termo e não cria nada (AC 2)', async () => {
    const res = await http().post('/api/kids/children').set(auth(tokenB)).send(childBody({ full_name: name('SemConsent') }));

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ code: 'kids_consent_required', term_version: KIDS_TERM_VERSION });
    expect(typeof res.body.term_text).toBe('string');
    expect(await admin.person.count({ where: { full_name: name('SemConsent') } })).toBe(0);
  });

  it('400 sem nome, com nascimento futuro, de adulto ou com campo desconhecido', async () => {
    const send = (body: Record<string, unknown>) => http().post('/api/kids/children').set(auth(tokenA)).send(body);

    expect((await send({ birth_date: birth(4) })).status).toBe(400);
    expect((await send(childBody({ birth_date: new Date(Date.now() + 86_400_000).toISOString() }))).status).toBe(400);
    expect((await send(childBody({ birth_date: birth(30) }))).status).toBe(400);
    expect((await send(childBody({ is_child: false }))).status).toBe(400);
  });

  it('403 para papel fora da lista e para plano Starter', async () => {
    const volunteer = await http().post('/api/kids/children').set(auth(h.tokenFor('volunteer'))).send(childBody());
    const starter = await http()
      .post('/api/kids/children')
      .set(auth(h.tokenT1('starter', 'member')))
      .send(childBody());

    expect(volunteer.status).toBe(403);
    expect(starter.status).toBe(403);
  });

  it('403 quando o responsável tenta cadastrar no lugar de outra pessoa', async () => {
    const res = await http()
      .post('/api/kids/children')
      .set(auth(tokenA))
      .send(childBody({ full_name: name('NoLugar'), guardian_person_id: personB }));

    expect(res.status).toBe(403);
    expect(await admin.person.count({ where: { full_name: name('NoLugar') } })).toBe(0);
  });

  it('cria Person is_child sem conta, no Household do responsável, com saúde em tabela própria (AC 1)', async () => {
    const res = await http().post('/api/kids/children').set(auth(tokenA)).send(childBody());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ full_name: name('Ana') });
    expect(JSON.stringify(res.body)).not.toContain(ALERGIA);

    const child = await admin.person.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { userAccounts: true, householdMemberships: true, kidsHealth: true },
    });
    expect(child.is_child).toBe(true);
    expect(child.userAccounts).toHaveLength(0);
    expect(child.household_id).not.toBeNull();
    expect(child.householdMemberships).toEqual([expect.objectContaining({ role: 'child', household_id: child.household_id })]);
    expect(child.kidsHealth?.allergies).toBe(ALERGIA);

    const parent = await admin.person.findUniqueOrThrow({ where: { id: personA } });
    expect(parent.household_id).toBe(child.household_id);
    const guardian = await admin.kidsGuardian.findFirstOrThrow({ where: { child_id: child.id } });
    expect(guardian).toMatchObject({ guardian_person_id: personA, is_primary: true, can_pickup: true, relationship: 'mãe' });
  });

  it('o segundo filho entra no mesmo Household', async () => {
    const res = await http().post('/api/kids/children').set(auth(tokenA)).send(childBody({ full_name: name('Beto'), allergies: undefined }));

    expect(res.status).toBe(201);
    const [ana, beto] = await Promise.all([
      admin.person.findFirstOrThrow({ where: { full_name: name('Ana') } }),
      admin.person.findUniqueOrThrow({ where: { id: res.body.id } }),
    ]);
    expect(beto.household_id).toBe(ana.household_id);
    expect(await admin.kidsChildHealth.count({ where: { person_id: beto.id } })).toBe(0);
  });

  it('secretaria no lugar do responsável: sem consentimento e sem registrá-lo é 422 (AC 7)', async () => {
    const res = await http()
      .post('/api/kids/children')
      .set(auth(secretaria))
      .send(childBody({ full_name: name('Caio'), guardian_person_id: personB }));

    expect(res.status).toBe(422);
    expect(await admin.person.count({ where: { full_name: name('Caio') } })).toBe(0);
    expect(await admin.consentRecord.count({ where: { person_id: personB } })).toBe(0);
  });

  it('secretaria registrando o consentimento: grava origin secretaria e salva (AC 7)', async () => {
    const res = await http()
      .post('/api/kids/children')
      .set(auth(secretaria))
      .send(childBody({ full_name: name('Caio'), guardian_person_id: personB, register_consent: true, allergies: undefined }));

    expect(res.status).toBe(201);
    const consent = await admin.consentRecord.findFirstOrThrow({ where: { person_id: personB } });
    expect(consent).toMatchObject({ origin: 'secretaria', version: KIDS_TERM_VERSION, revoked_at: null });
    const guardian = await admin.kidsGuardian.findFirstOrThrow({ where: { child_id: res.body.id } });
    expect(guardian.guardian_person_id).toBe(personB);
  });

  it('404 quando a secretaria indica um responsável que não existe na congregação', async () => {
    const res = await http()
      .post('/api/kids/children')
      .set(auth(secretaria))
      .send(childBody({ guardian_person_id: '00000000-0000-4000-8000-000000000000', register_consent: true }));

    expect(res.status).toBe(404);
  });
});

describe('GET /kids/children, GET /kids/children/:id e isolamento', () => {
  let anaId: string;
  let caioId: string;

  beforeAll(async () => {
    anaId = (await admin.person.findFirstOrThrow({ where: { full_name: name('Ana') } })).id;
    caioId = (await admin.person.findFirstOrThrow({ where: { full_name: name('Caio') } })).id;
  });

  it('o responsável A vê só os próprios filhos; o B não vê os de A', async () => {
    const a = await http().get('/api/kids/children').set(auth(tokenA));
    const b = await http().get('/api/kids/children').set(auth(tokenB));

    expect(a.status).toBe(200);
    expect(a.body.map((c: { full_name: string }) => c.full_name).sort()).toEqual([name('Ana'), name('Beto')]);
    expect(JSON.stringify(a.body)).not.toContain(ALERGIA);
    expect(b.body.map((c: { full_name: string }) => c.full_name)).toEqual([name('Caio')]);
  });

  it('a equipe busca por nome na congregação', async () => {
    const res = await http().get('/api/kids/children').query({ search: tag }).set(auth(secretaria));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    const one = await http().get('/api/kids/children').query({ search: 'ana' }).set(auth(secretaria));
    expect(one.body.map((c: { full_name: string }) => c.full_name)).toContain(name('Ana'));
  });

  it('o responsável A abre a ficha do filho, com saúde e responsáveis', async () => {
    const res = await http().get(`/api/kids/children/${anaId}`).set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: anaId, allergies: ALERGIA, medical_notes: null });
    expect(res.body.guardians).toEqual([expect.objectContaining({ guardian_person_id: personA, is_primary: true })]);
  });

  it('o responsável B não abre nem altera a ficha do filho de A: 404 igual a inexistente', async () => {
    const get = await http().get(`/api/kids/children/${anaId}`).set(auth(tokenB));
    const patch = await http().patch(`/api/kids/children/${anaId}`).set(auth(tokenB)).send({ allergies: 'x' });
    const missing = await http().get('/api/kids/children/00000000-0000-4000-8000-000000000000').set(auth(tokenB));

    expect(get.status).toBe(404);
    expect(patch.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((await admin.kidsChildHealth.findUniqueOrThrow({ where: { person_id: anaId } })).allergies).toBe(ALERGIA);
  });

  it('400 para id que não é UUID', async () => {
    const res = await http().get('/api/kids/children/nao-e-uuid').set(auth(tokenA));
    expect(res.status).toBe(400);
  });

  it('teste1 (outro tenant) não enxerga a criança de teste2, nem como equipe', async () => {
    const t1 = h.tokenT1('premium', 'pastor');
    const list = await http().get('/api/kids/children').query({ search: tag }).set(auth(t1));
    const ficha = await http().get(`/api/kids/children/${anaId}`).set(auth(t1));

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(0);
    expect(ficha.status).toBe(404);
  });

  it('leitura da ficha pela equipe é auditada (quem/quando/qual criança) e o log não guarda o conteúdo (AC 5)', async () => {
    const before = await admin.auditLog.count({ where: { subject_person_id: anaId, action: 'kids.health_read' } });

    const res = await http().get(`/api/kids/children/${anaId}`).set(auth(pastor));
    expect(res.status).toBe(200);
    expect(res.body.allergies).toBe(ALERGIA);

    // O registro é best-effort e assíncrono ao fim da resposta: espera até aparecer.
    let rows: Awaited<ReturnType<typeof admin.auditLog.findMany>> = [];
    for (let i = 0; i < 20 && rows.length <= before; i++) {
      rows = await admin.auditLog.findMany({ where: { subject_person_id: anaId, action: 'kids.health_read' } });
      if (rows.length <= before) await new Promise((r) => setTimeout(r, 100));
    }
    expect(rows.length).toBe(before + 1);
    expect(rows[rows.length - 1]).toMatchObject({ entity: 'kids_child_health', tenant_id: h.t2.tenantId });
    expect(JSON.stringify(rows)).not.toContain(ALERGIA);
  });

  it('o responsável lendo o próprio filho não gera auditoria de equipe', async () => {
    const before = await admin.auditLog.count({ where: { subject_person_id: caioId, action: 'kids.health_read' } });
    const res = await http().get(`/api/kids/children/${caioId}`).set(auth(tokenB));

    expect(res.status).toBe(200);
    expect(await admin.auditLog.count({ where: { subject_person_id: caioId, action: 'kids.health_read' } })).toBe(before);
  });

  it('criança não aparece em /persons (listagem nem ficha) — AD-013', async () => {
    const list = await http().get('/api/persons').query({ search: tag, limit: 100 }).set(auth(secretaria));
    const one = await http().get(`/api/persons/${anaId}`).set(auth(secretaria));

    expect(list.status).toBe(200);
    const names = list.body.data.map((p: { full_name: string }) => p.full_name);
    expect(names).toEqual(expect.arrayContaining([name('RespA'), name('RespB')]));
    expect(names).not.toContain(name('Ana'));
    expect(one.status).toBe(404);
  });
});

describe('PATCH /kids/children/:id', () => {
  it('o responsável atualiza nome e saúde; a resposta não traz saúde e a ficha mostra o novo valor', async () => {
    const ana = await admin.person.findFirstOrThrow({ where: { full_name: name('Ana') } });

    const res = await http()
      .patch(`/api/kids/children/${ana.id}`)
      .set(auth(tokenA))
      .send({ medical_notes: 'asma leve', allergies: null });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('asma');
    const ficha = await http().get(`/api/kids/children/${ana.id}`).set(auth(tokenA));
    expect(ficha.body).toMatchObject({ allergies: null, medical_notes: 'asma leve' });
  });

  it('400 com nascimento futuro ou campo desconhecido', async () => {
    const ana = await admin.person.findFirstOrThrow({ where: { full_name: name('Ana') } });
    const future = await http()
      .patch(`/api/kids/children/${ana.id}`)
      .set(auth(tokenA))
      .send({ birth_date: new Date(Date.now() + 86_400_000).toISOString() });
    const unknown = await http().patch(`/api/kids/children/${ana.id}`).set(auth(tokenA)).send({ is_child: false });

    expect(future.status).toBe(400);
    expect(unknown.status).toBe(400);
  });
});

describe('guardiões: POST /kids/children/:id/guardians e DELETE /kids/guardians/:id', () => {
  let anaId: string;
  let rosaGuardianId: string;

  beforeAll(async () => {
    anaId = (await admin.person.findFirstOrThrow({ where: { full_name: name('Ana') } })).id;
  });

  it('o responsável adiciona terceiro autorizado com nome e telefone (AC 3)', async () => {
    const res = await http()
      .post(`/api/kids/children/${anaId}/guardians`)
      .set(auth(tokenA))
      .send({ full_name: name('Rosa'), phone: '11988887777', relationship: 'avó' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ child_id: anaId, relationship: 'avó', can_pickup: true, is_primary: false });
    rosaGuardianId = res.body.id;
    const rosa = await admin.person.findUniqueOrThrow({
      where: { id: res.body.guardian_person_id },
      include: { userAccounts: true },
    });
    expect(rosa).toMatchObject({ full_name: name('Rosa'), phone: '11988887777', is_child: false });
    expect(rosa.userAccounts).toHaveLength(0);
  });

  it('a ficha lista o terceiro autorizado', async () => {
    const res = await http().get(`/api/kids/children/${anaId}`).set(auth(tokenA));
    expect(res.body.guardians.map((g: { full_name: string }) => g.full_name)).toContain(name('Rosa'));
  });

  it('409 ao adicionar de novo a mesma pessoa', async () => {
    const rosa = await admin.kidsGuardian.findUniqueOrThrow({ where: { id: rosaGuardianId } });
    const res = await http()
      .post(`/api/kids/children/${anaId}/guardians`)
      .set(auth(tokenA))
      .send({ guardian_person_id: rosa.guardian_person_id, relationship: 'avó' });

    expect(res.status).toBe(409);
  });

  it('400 sem relationship, sem nome/telefone ou com primário que não retira', async () => {
    const send = (body: Record<string, unknown>) =>
      http().post(`/api/kids/children/${anaId}/guardians`).set(auth(tokenA)).send(body);

    expect((await send({ full_name: 'X', phone: '1' })).status).toBe(400);
    expect((await send({ relationship: 'tio' })).status).toBe(400);
    expect((await send({ full_name: 'X', phone: '1', relationship: 'tio', is_primary: true, can_pickup: false })).status).toBe(400);
  });

  it('404 quando o responsável B tenta adicionar autorizado ou remover o de A', async () => {
    const add = await http()
      .post(`/api/kids/children/${anaId}/guardians`)
      .set(auth(tokenB))
      .send({ full_name: name('Intruso'), phone: '1', relationship: 'tio' });
    const del = await http().delete(`/api/kids/guardians/${rosaGuardianId}`).set(auth(tokenB));

    expect(add.status).toBe(404);
    expect(del.status).toBe(404);
    expect(await admin.person.count({ where: { full_name: name('Intruso') } })).toBe(0);
    expect(await admin.kidsGuardian.count({ where: { id: rosaGuardianId } })).toBe(1);
  });

  it('400 para id inválido e 404 para autorizado inexistente', async () => {
    const bad = await http().delete('/api/kids/guardians/xyz').set(auth(tokenA));
    const none = await http().delete('/api/kids/guardians/00000000-0000-4000-8000-000000000000').set(auth(tokenA));

    expect(bad.status).toBe(400);
    expect(none.status).toBe(404);
  });

  it('422 ao remover o último responsável primário (AC 4); o terceiro sai com 204', async () => {
    const primary = await admin.kidsGuardian.findFirstOrThrow({ where: { child_id: anaId, is_primary: true } });

    const refused = await http().delete(`/api/kids/guardians/${primary.id}`).set(auth(tokenA));
    const removed = await http().delete(`/api/kids/guardians/${rosaGuardianId}`).set(auth(tokenA));

    expect(refused.status).toBe(422);
    expect(await admin.kidsGuardian.count({ where: { id: primary.id } })).toBe(1);
    expect(removed.status).toBe(204);
    expect(await admin.kidsGuardian.count({ where: { id: rosaGuardianId } })).toBe(0);
  });

  it('com dois primários, um deles pode ser removido', async () => {
    const second = await http()
      .post(`/api/kids/children/${anaId}/guardians`)
      .set(auth(tokenA))
      .send({ full_name: name('Pai'), phone: '11977776666', relationship: 'pai', is_primary: true });
    expect(second.status).toBe(201);
    const first = await admin.kidsGuardian.findFirstOrThrow({ where: { child_id: anaId, guardian_person_id: personA } });

    const res = await http().delete(`/api/kids/guardians/${first.id}`).set(auth(tokenA));

    expect(res.status).toBe(204);
  });
});

describe('PATCH /kids/guardians/:id (editar responsável)', () => {
  let biaId: string;
  let paiRow: string; // pai: responsável da família, não primário, com conta (tokenB)
  let rosaRow: string; // avó: terceiro sem conta
  let maeRow: string; // responsável A: primária
  const patch = (token: string, id: string, body: Record<string, unknown>) =>
    http().patch(`/api/kids/guardians/${id}`).set(auth(token)).send(body);
  const row = (id: string) => admin.kidsGuardian.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    expect((await accept(tokenA)).status).toBeLessThan(300);
    const created = await http().post('/api/kids/children').set(auth(tokenA)).send(childBody({ full_name: name('Bia') }));
    expect(created.status).toBe(201);
    biaId = created.body.id;
    const bia = await admin.person.findUniqueOrThrow({ where: { id: biaId } });
    // B entra na família da Bia como cônjuge, autorizado mas não primário.
    await admin.householdMember.create({ data: { household_id: bia.household_id!, person_id: personB, role: 'spouse' } });
    const pai = await http()
      .post(`/api/kids/children/${biaId}/guardians`)
      .set(auth(tokenA))
      .send({ guardian_person_id: personB, relationship: 'pai' });
    paiRow = pai.body.id;
    const rosa = await http()
      .post(`/api/kids/children/${biaId}/guardians`)
      .set(auth(tokenA))
      .send({ full_name: name('Rosa2'), phone: '11911112222', relationship: 'avó' });
    rosaRow = rosa.body.id;
    maeRow = (await admin.kidsGuardian.findFirstOrThrow({ where: { child_id: biaId, guardian_person_id: personA } })).id;
  });

  it('o responsável primário altera parentesco e retirada de um autorizado', async () => {
    const res = await patch(tokenA, rosaRow, { can_pickup: false, relationship: 'vizinha' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: rosaRow, can_pickup: false, relationship: 'vizinha', is_primary: false });
    expect(await row(rosaRow)).toMatchObject({ can_pickup: false, relationship: 'vizinha' });
    await patch(tokenA, rosaRow, { can_pickup: true });
  });

  it('403 para o responsável da família que não é o primário; nada muda', async () => {
    const res = await patch(tokenB, rosaRow, { relationship: 'intruso' });

    expect(res.status).toBe(403);
    expect((await row(rosaRow)).relationship).toBe('vizinha');
  });

  it('404 para criança alheia (responsável de outra família) e para autorizado inexistente', async () => {
    const outra = await accept(tokenB);
    expect(outra.status).toBeLessThan(300);
    const mk = await http().post('/api/kids/children').set(auth(tokenB)).send(childBody({ full_name: name('Caio') }));
    expect(mk.status).toBe(201);
    const caioRow = await admin.kidsGuardian.findFirstOrThrow({ where: { child_id: mk.body.id, is_primary: true } });
    expect((await patch(tokenA, caioRow.id, { relationship: 'x' })).status).toBe(404);
    expect((await patch(tokenA, '00000000-0000-4000-8000-000000000000', { relationship: 'x' })).status).toBe(404);
  });

  it('a gestão edita sem ser da família; voluntário, visitante e plano Starter são barrados', async () => {
    expect((await patch(pastor, rosaRow, { relationship: 'avó' })).status).toBe(200);
    expect((await patch(h.tokenFor('volunteer'), rosaRow, { relationship: 'x' })).status).toBe(403);
    expect((await patch(h.tokenFor('visitor'), rosaRow, { relationship: 'x' })).status).toBe(403);
    expect((await patch(h.tokenT1('starter', 'pastor'), rosaRow, { relationship: 'x' })).status).toBe(403);
    expect((await row(rosaRow)).relationship).toBe('avó');
  });

  it('400 para corpo vazio, tipos errados, campo extra, parentesco em branco e id malformado', async () => {
    expect((await patch(tokenA, rosaRow, {})).status).toBe(400);
    expect((await patch(tokenA, rosaRow, { can_pickup: 'sim' })).status).toBe(400);
    expect((await patch(tokenA, rosaRow, { relationship: '   ' })).status).toBe(400);
    expect((await patch(tokenA, rosaRow, { guardian_person_id: personB })).status).toBe(400);
    expect((await patch(tokenA, 'xyz', { relationship: 'x' })).status).toBe(400);
  });

  it('400 quando o primário ficaria sem poder retirar', async () => {
    expect((await patch(tokenA, maeRow, { can_pickup: false })).status).toBe(400);
    expect((await patch(tokenA, paiRow, { is_primary: true, can_pickup: false })).status).toBe(400);
    expect((await row(maeRow)).can_pickup).toBe(true);
  });

  it('422 ao rebaixar o único primário; nada muda', async () => {
    const res = await patch(tokenA, maeRow, { is_primary: false });

    expect(res.status).toBe(422);
    expect((await row(maeRow)).is_primary).toBe(true);
  });

  it('promover outro rebaixa o anterior de uma vez: a criança segue com exatamente um primário', async () => {
    const res = await patch(tokenA, paiRow, { is_primary: true });

    expect(res.status).toBe(200);
    expect(res.body.is_primary).toBe(true);
    expect((await row(maeRow)).is_primary).toBe(false);
    expect(await admin.kidsGuardian.count({ where: { child_id: biaId, is_primary: true } })).toBe(1);
  });

  it('depois da troca, a antiga primária deixa de poder editar (403) e o novo primário pode', async () => {
    expect((await patch(tokenA, rosaRow, { relationship: 'x' })).status).toBe(403);
    expect((await patch(tokenB, rosaRow, { relationship: 'avó materna' })).status).toBe(200);
  });
});

describe('POST /kids/consent/revoke (AC 6)', () => {
  it('revogar mantém o histórico e volta a exigir consentimento no cadastro', async () => {
    const res = await http().post('/api/kids/consent/revoke').set(auth(tokenA)).send({ reason: 'teste' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked: 1 });
    const record = await admin.consentRecord.findFirstOrThrow({ where: { person_id: personA, origin: 'kids' } });
    expect(record.revoked_at).not.toBeNull();
    expect(record.revocation_reason).toBe('teste');

    const status = await http().get('/api/kids/consent').set(auth(tokenA));
    expect(status.body.valid).toBe(false);
    const create = await http().post('/api/kids/children').set(auth(tokenA)).send(childBody({ full_name: name('Dani') }));
    expect(create.status).toBe(422);
  });
});
