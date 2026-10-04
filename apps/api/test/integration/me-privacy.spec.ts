/**
 * Direitos do titular (`CONF-03`) por HTTP, contra o Postgres de verdade.
 *
 * O teste de unidade prova a regra; este prova que, com o RLS ativo (a rota
 * roda como `app_user` pelo `TenantContextInterceptor`), cada titular só
 * alcança a própria pessoa — o que vem da conta do token, nunca do corpo — e
 * que o pedido de exclusão cai no mesmo `deleted_at` que o job de 30 dias lê.
 *
 * Roda em `teste1-church` (`docs/AMBIENTES.md`): cria as pessoas e contas de
 * que precisa e as apaga no fim.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { loadTestTenant, type TestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

const ts = Date.now();
let app: INestApplication;
let tenant: TestTenant;
let anaPersonId: string;
let beaPersonId: string;
const accountIds: string[] = [];
let tokenAna: string;
let tokenBea: string;
let tokenSemPessoa: string;

beforeAll(async () => {
  tenant = await loadTestTenant(admin, 'teste1-church');

  const pessoa = (full_name: string, phone: string) =>
    admin.person.create({
      data: {
        tenant_id: tenant.tenantId,
        congregation_id: tenant.congregationId,
        full_name,
        phone,
        classification: 'member',
      },
    });
  anaPersonId = (await pessoa(`Ana Privacidade ${ts}`, `5511900${ts % 100000}`)).id;
  beaPersonId = (await pessoa(`Bea Privacidade ${ts}`, `5511911${ts % 100000}`)).id;

  await admin.consentRecord.create({
    data: {
      tenant_id: tenant.tenantId,
      congregation_id: tenant.congregationId,
      person_id: anaPersonId,
      version: 'member_consent_v1',
      consented_at: new Date(),
    },
  });
  await admin.consentRecord.create({
    data: {
      tenant_id: tenant.tenantId,
      congregation_id: tenant.congregationId,
      person_id: beaPersonId,
      version: 'member_consent_v1',
      consented_at: new Date(),
    },
  });

  const conta = async (email: string, personId: string | null) => {
    const account = await admin.userAccount.create({
      data: {
        tenant_id: tenant.tenantId,
        congregation_id: tenant.congregationId,
        person_id: personId,
        email,
        password_hash: 'x',
        is_active: true,
      },
    });
    accountIds.push(account.id);
    return account;
  };
  const ana = await conta(`ana-priv-${ts}@teste1.fake`, anaPersonId);
  const bea = await conta(`bea-priv-${ts}@teste1.fake`, beaPersonId);
  const semPessoa = await conta(`sem-pessoa-priv-${ts}@teste1.fake`, null);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  const jwt = app.get(JwtService);
  const sign = (sub: string, email: string) =>
    jwt.sign({
      sub,
      email,
      tenant_id: tenant.tenantId,
      congregation_id: tenant.congregationId,
      roles: ['member'],
      plan: tenant.plan,
    });
  tokenAna = sign(ana.id, ana.email);
  tokenBea = sign(bea.id, bea.email);
  tokenSemPessoa = sign(semPessoa.id, semPessoa.email);
}, 120_000);

afterAll(async () => {
  const persons = [anaPersonId, beaPersonId].filter(Boolean);
  await admin.auditLog.deleteMany({ where: { subject_person_id: { in: persons } } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await admin.consentRecord.deleteMany({ where: { person_id: { in: persons } } });
  await admin.person.deleteMany({ where: { id: { in: persons } } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

const api = () => request(app.getHttpServer());

describe('GET /me/personal-data', () => {
  it('devolve só a pessoa da conta do token, com os consentimentos dela', async () => {
    const res = await api().get('/api/me/personal-data').set('Authorization', `Bearer ${tokenAna}`);

    expect(res.status).toBe(200);
    expect(res.body.person.id).toBe(anaPersonId);
    expect(res.body.consents).toHaveLength(1);
    expect(res.body.consents[0].version).toBe('member_consent_v1');
    expect(res.body.deletion).toEqual({ requested_at: null, anonymize_after: null, cancellable: false });
  });

  it('conta sem pessoa vinculada recebe 404', async () => {
    const res = await api()
      .get('/api/me/personal-data')
      .set('Authorization', `Bearer ${tokenSemPessoa}`);
    expect(res.status).toBe(404);
  });

  it('sem token, 401', async () => {
    const res = await api().get('/api/me/personal-data');
    expect(res.status).toBe(401);
  });
});

describe('GET /me/export', () => {
  it('entrega o documento versionado como anexo e registra a exportação', async () => {
    const res = await api().get('/api/me/export').set('Authorization', `Bearer ${tokenAna}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('meus-dados.json');
    expect(res.body.format).toBe('orbien.personal-data.v1');
    expect(res.body.person.id).toBe(anaPersonId);

    const audit = await admin.auditLog.count({
      where: { subject_person_id: anaPersonId, action: 'person.data_exported' },
    });
    expect(audit).toBe(1);
  });
});

describe('PATCH /me', () => {
  it('corrige o telefone e grava antes/depois na auditoria', async () => {
    const res = await api()
      .patch('/api/me')
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ phone: '11988887777', address_city: 'São Paulo' });

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('11988887777');
    const stored = await admin.person.findUniqueOrThrow({ where: { id: anaPersonId } });
    expect(stored.address_city).toBe('São Paulo');

    const audit = await admin.auditLog.findFirstOrThrow({
      where: { subject_person_id: anaPersonId, action: 'person.self_updated' },
    });
    expect(audit.after).toMatchObject({ phone: '11988887777', address_city: 'São Paulo' });
  });

  it('não aceita campo fora da lista (classificação é do admin)', async () => {
    const res = await api()
      .patch('/api/me')
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ classification: 'visitor' });
    expect(res.status).toBe(400);
  });

  it('não alcança a pessoa de outra conta da mesma congregação', async () => {
    await api()
      .patch('/api/me')
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ full_name: 'Nome Trocado' });

    const bea = await admin.person.findUniqueOrThrow({ where: { id: beaPersonId } });
    expect(bea.full_name).toBe(`Bea Privacidade ${ts}`);
  });
});

describe('POST /me/revoke-consent', () => {
  it('revoga o aceite ativo da versão — e só o do titular', async () => {
    const res = await api()
      .post('/api/me/revoke-consent')
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ version: 'member_consent_v1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked: 1 });

    const anaConsent = await admin.consentRecord.findFirstOrThrow({ where: { person_id: anaPersonId } });
    expect(anaConsent.revoked_at).not.toBeNull();
    const beaConsent = await admin.consentRecord.findFirstOrThrow({ where: { person_id: beaPersonId } });
    expect(beaConsent.revoked_at).toBeNull();
  });

  it('revogar de novo responde 404 — não há aceite ativo', async () => {
    const res = await api()
      .post('/api/me/revoke-consent')
      .set('Authorization', `Bearer ${tokenAna}`)
      .send({ version: 'member_consent_v1' });
    expect(res.status).toBe(404);
  });
});

describe('pedido de exclusão', () => {
  it('POST marca o pedido e devolve a data da anonimização (30 dias)', async () => {
    const res = await api()
      .post('/api/me/deletion-request')
      .set('Authorization', `Bearer ${tokenBea}`);

    expect(res.status).toBe(200);
    expect(res.body.cancellable).toBe(true);
    const requested = new Date(res.body.requested_at).getTime();
    const after = new Date(res.body.anonymize_after).getTime();
    expect(Math.round((after - requested) / 86_400_000)).toBe(30);

    const bea = await admin.person.findUniqueOrThrow({ where: { id: beaPersonId } });
    expect(bea.deleted_at).not.toBeNull();
    expect(bea.anonymized_at).toBeNull();
  });

  it('pedir de novo não reinicia o prazo', async () => {
    const before = await admin.person.findUniqueOrThrow({ where: { id: beaPersonId } });
    const res = await api()
      .post('/api/me/deletion-request')
      .set('Authorization', `Bearer ${tokenBea}`);

    expect(new Date(res.body.requested_at).getTime()).toBe(before.deleted_at!.getTime());
  });

  it('DELETE cancela dentro do prazo e o cadastro volta', async () => {
    const res = await api()
      .delete('/api/me/deletion-request')
      .set('Authorization', `Bearer ${tokenBea}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested_at: null, anonymize_after: null, cancellable: false });
    const bea = await admin.person.findUniqueOrThrow({ where: { id: beaPersonId } });
    expect(bea.deleted_at).toBeNull();
  });

  it('remoção feita pela igreja não se desfaz pelo titular: 409', async () => {
    // Como o `PersonsService.remove` faz: marca deleted_at e registra
    // `person.deleted` em audit_logs, pelo audit_insert().
    await admin.person.update({ where: { id: beaPersonId }, data: { deleted_at: new Date() } });
    await admin.$executeRaw`
      SELECT audit_insert(
        ${tenant.tenantId}::text, ${tenant.congregationId}::text, ${accountIds[0]}::text,
        ${beaPersonId}::text, 'person'::text, 'person.deleted'::text,
        NULL::jsonb, NULL::jsonb, NULL::text, NULL::text, NULL::text
      )
    `;

    const data = await api().get('/api/me/personal-data').set('Authorization', `Bearer ${tokenBea}`);
    expect(data.body.deletion.cancellable).toBe(false);

    const res = await api()
      .delete('/api/me/deletion-request')
      .set('Authorization', `Bearer ${tokenBea}`);
    expect(res.status).toBe(409);
    const bea = await admin.person.findUniqueOrThrow({ where: { id: beaPersonId } });
    expect(bea.deleted_at).not.toBeNull();

    await admin.person.update({ where: { id: beaPersonId }, data: { deleted_at: null } });
  });

  it('cancelar sem pedido em aberto responde 404', async () => {
    const res = await api()
      .delete('/api/me/deletion-request')
      .set('Authorization', `Bearer ${tokenBea}`);
    expect(res.status).toBe(404);
  });
});
