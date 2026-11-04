/**
 * `PATCH /volunteers/me/profile` e `POST /volunteers/me/term` (PROD-36) por HTTP,
 * contra o Postgres de verdade, com o RLS ativo.
 *
 * Prova: o voluntário edita só a própria disponibilidade; habilidade e qualquer
 * outro campo é 400; ninguém alcança o perfil alheio (a pessoa vem da conta no
 * banco); o aceite grava `consent_records` (versão, origem, ip, user-agent) e
 * `audit_logs`, e reaceitar não duplica.
 *
 * Roda em `teste1-church` (`docs/AMBIENTES.md`).
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { loadTestTenant, type TestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });

const ts = Date.now();
let app: INestApplication;
let tenant: TestTenant;
const personIds: string[] = [];
const accountIds: string[] = [];
const profile: Record<string, string> = {};
const token: Record<string, string> = {};
let tokenSuporte: string;

beforeAll(async () => {
  tenant = await loadTestTenant(admin, 'teste1-church');
  const scope = { tenant_id: tenant.tenantId, congregation_id: tenant.congregationId };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();
  const jwt = app.get(JwtService);

  for (const nome of ['ana', 'bia']) {
    const person = await admin.person.create({
      data: { ...scope, full_name: `${nome} Perfil ${ts}`, classification: 'member' },
    });
    personIds.push(person.id);
    const account = await admin.userAccount.create({
      data: { ...scope, person_id: person.id, email: `${nome}-vperfil-${ts}@teste1.fake`, password_hash: 'x', is_active: true },
    });
    accountIds.push(account.id);
    const vp = await admin.volunteerProfile.create({
      data: { ...scope, person_id: person.id, availability: { sunday: ['morning'] }, skills: ['OBS'], restrictions: 'Só manhã' },
    });
    profile[nome] = vp.id;
    const sign = (extra: object = {}) =>
      jwt.sign({
        sub: account.id,
        email: account.email,
        ...scope,
        roles: ['volunteer'],
        plan: tenant.plan,
        ...extra,
      });
    token[nome] = sign();
    if (nome === 'ana') tokenSuporte = sign({ support_session: true });
  }
}, 120_000);

afterAll(async () => {
  await admin.auditLog.deleteMany({ where: { subject_person_id: { in: personIds } } });
  await admin.consentRecord.deleteMany({ where: { person_id: { in: personIds } } });
  await admin.volunteerProfile.deleteMany({ where: { person_id: { in: personIds } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

const api = () => request(app.getHttpServer());
const as = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('PATCH /volunteers/me/profile', () => {
  it('edita a própria disponibilidade e deixa o resto como está', async () => {
    const res = await api()
      .patch('/api/volunteers/me/profile')
      .set(as(token.ana))
      .send({ availability: { saturday: ['evening', 'evening'], sunday: ['morning', 'afternoon'] } });

    expect(res.status).toBe(200);
    expect(res.body.availability).toEqual({ saturday: ['evening'], sunday: ['morning', 'afternoon'] });
    const row = await admin.volunteerProfile.findUniqueOrThrow({ where: { id: profile.ana } });
    expect(row.availability).toEqual({ saturday: ['evening'], sunday: ['morning', 'afternoon'] });
    expect(row.skills).toEqual(['OBS']);
    expect(row.restrictions).toBe('Só manhã');
  });

  it('grava a auditoria com antes e depois', async () => {
    const log = await admin.auditLog.findFirst({
      where: { subject_person_id: personIds[0], action: 'volunteer_profile.self_updated' },
    });
    expect(log).toMatchObject({
      entity: 'volunteer_profile',
      before: { availability: { sunday: ['morning'] } },
      after: { availability: { saturday: ['evening'], sunday: ['morning', 'afternoon'] } },
    });
  });

  it.each([
    ['skills', { skills: ['Hack'] }],
    ['restrictions', { restrictions: 'nada' }],
    ['person_id', { person_id: '9b8d5f04-1c1e-4c5e-9d0e-2b7e5d1f0a11' }],
  ])('campo %s junto da disponibilidade: 400 e nada é gravado', async (_nome, extra) => {
    const antes = await admin.volunteerProfile.findUniqueOrThrow({ where: { id: profile.bia } });
    const res = await api()
      .patch('/api/volunteers/me/profile')
      .set(as(token.bia))
      .send({ availability: { monday: ['evening'] }, ...extra });

    expect(res.status).toBe(400);
    const depois = await admin.volunteerProfile.findUniqueOrThrow({ where: { id: profile.bia } });
    expect(depois.availability).toEqual(antes.availability);
    expect(depois.skills).toEqual(['OBS']);
  });

  it('turno inválido: 400', async () => {
    const res = await api()
      .patch('/api/volunteers/me/profile')
      .set(as(token.bia))
      .send({ availability: { monday: ['madrugada'] } });
    expect(res.status).toBe(400);
  });

  it('um voluntário não edita o perfil do outro: a edição da Ana não toca a Bia', async () => {
    const bia = await admin.volunteerProfile.findUniqueOrThrow({ where: { id: profile.bia } });
    expect(bia.availability).toEqual({ sunday: ['morning'] });
    // E a rota nem aceita um alvo: id na URL não existe.
    const res = await api()
      .patch(`/api/volunteers/me/profile/${profile.bia}`)
      .set(as(token.ana))
      .send({ availability: {} });
    expect(res.status).toBe(404);
  });

  it('sem token: 401; sessão de suporte: 403', async () => {
    expect((await api().patch('/api/volunteers/me/profile').send({ availability: {} })).status).toBe(401);
    const res = await api()
      .patch('/api/volunteers/me/profile')
      .set(as(tokenSuporte))
      .send({ availability: { friday: ['evening'] } });
    expect(res.status).toBe(403);
  });
});

describe('POST /volunteers/me/term', () => {
  const aceitar = (t: string, version = 'volunteer_term_v1') =>
    api().post('/api/volunteers/me/term').set(as(t)).set('User-Agent', 'jest-vperfil').send({ term_version: version });

  it('o perfil traz o termo vigente, ainda não aceito', async () => {
    const res = await api().get('/api/volunteers/me/profile').set(as(token.bia));
    expect(res.body.term).toMatchObject({ version: 'volunteer_term_v1', accepted_at: null });
    expect(res.body.term.text).toEqual(expect.any(String));
  });

  it('aceitar grava consent_record (versão, origem, user-agent) e a auditoria', async () => {
    const res = await aceitar(token.bia);
    expect(res.status).toBe(200);
    expect(res.body.term.accepted_at).not.toBeNull();

    const rows = await admin.consentRecord.findMany({ where: { person_id: personIds[1] } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      version: 'volunteer_term_v1',
      origin: 'volunteer_app',
      user_agent: 'jest-vperfil',
      revoked_at: null,
      tenant_id: tenant.tenantId,
    });
    const logs = await admin.auditLog.count({ where: { subject_person_id: personIds[1], action: 'consent.granted' } });
    expect(logs).toBe(1);
  });

  it('reaceitar a mesma versão não duplica', async () => {
    const antes = await admin.consentRecord.findFirstOrThrow({ where: { person_id: personIds[1] } });
    const res = await aceitar(token.bia);
    expect(res.status).toBe(200);
    expect(res.body.term.accepted_at).toBe(antes.consented_at.toISOString());
    expect(await admin.consentRecord.count({ where: { person_id: personIds[1] } })).toBe(1);
    expect(await admin.auditLog.count({ where: { subject_person_id: personIds[1], action: 'consent.granted' } })).toBe(1);
  });

  it('o aceite da Bia não vale para a Ana', async () => {
    const res = await api().get('/api/volunteers/me/profile').set(as(token.ana));
    expect(res.body.term.accepted_at).toBeNull();
  });

  it('revogada por POST /me/revoke-consent, o termo volta a "não aceito"', async () => {
    const rev = await api().post('/api/me/revoke-consent').set(as(token.bia)).send({ version: 'volunteer_term_v1' });
    expect(rev.status).toBe(200);
    const res = await api().get('/api/volunteers/me/profile').set(as(token.bia));
    expect(res.body.term.accepted_at).toBeNull();
    // Aceitar de novo cria um registro novo: o revogado fica como histórico (CONF-02 o apaga depois).
    expect((await aceitar(token.bia)).status).toBe(200);
    expect(await admin.consentRecord.count({ where: { person_id: personIds[1] } })).toBe(2);
  });

  it('versão que não é a vigente: 409 e nada gravado; sessão de suporte: 403', async () => {
    const antes = await admin.consentRecord.count({ where: { person_id: personIds[0] } });
    expect((await aceitar(token.ana, 'volunteer_term_v0')).status).toBe(409);
    expect((await aceitar(tokenSuporte)).status).toBe(403);
    expect(await admin.consentRecord.count({ where: { person_id: personIds[0] } })).toBe(antes);
  });
});
