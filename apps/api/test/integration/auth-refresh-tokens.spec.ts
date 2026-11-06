/**
 * Refresh token de ponta a ponta no banco real (PEND-04, `refresh_tokens`).
 *
 * `orbien_app` deixa de escrever em `refresh_tokens` direto: a leitura por hash
 * é `auth_refresh_lookup` (036) e a escrita roda como `app_user` com o dono do
 * token fixado (`withRefreshContext`). O que este arquivo prende, e que os
 * mocks do `auth.service.spec.ts` não alcançam:
 *
 *   - rotação encadeia `replaced_by_id`;
 *   - REUSO de token revogado derruba a família inteira;
 *   - duas rotações simultâneas: exatamente uma vence, a outra derruba a família;
 *   - conta inativa não rotaciona e a família cai;
 *   - logout revoga, e hash desconhecido é idempotente;
 *   - login de plataforma e retenção (CONF-02) continuam funcionando.
 *
 * O bloco é rodado DUAS vezes: com a policy `orbien_app_auth` de
 * `refresh_tokens` no lugar (release 1) e SEM ela (o estado da release 2, que
 * ainda não existe como script). O código desta release tem que passar nos dois
 * — é a prova de que a contração é segura. A policy é derrubada por DDL e
 * recolocada no `afterAll` (idêntica à do 017); a suíte é `--runInBand`.
 *
 * Tenants criados aqui e apagados no fim; `doca-church` nunca.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlanStatus, PlanType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { hashToken } from '../../src/common/crypto/token-hash';
import { AuthTokensRetentionService } from '../../src/auth/auth-tokens-retention.service';
import { ensureRole } from '../helpers/rls';

const SENHA = 'senha-de-teste-refresh';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

let app: INestApplication;
const http = () => request(app.getHttpServer());
const ts = Date.now();
let tenantId: string;
let congregationId: string;
let seq = 0;

async function criarConta(roleCode: string, isActive = true) {
  seq += 1;
  const email = `rt-${seq}-${ts}@orbien.test`;
  const conta = await admin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      email,
      password_hash: await argon2.hash(SENHA),
      is_active: isActive,
    },
  });
  await admin.roleAssignment.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      user_account_id: conta.id,
      role_code: roleCode,
    },
  });
  return { id: conta.id, email };
}

type Par = { access_token: string; refresh_token: string };
const login = async (email: string) =>
  (await http().post('/api/auth/login').send({ email, password: SENHA }).expect(200)).body as Par;
const refresh = (t: string) => http().post('/api/auth/refresh').send({ refresh_token: t });
const linhas = (userId: string) =>
  admin.refreshToken.findMany({ where: { user_account_id: userId }, orderBy: { created_at: 'asc' } });

beforeAll(async () => {
  await ensureRole(admin, 'tenant_admin', 'Admin Tenant');
  await ensureRole(admin, 'platform_support', 'Platform Support');

  const tenant = await admin.tenant.create({ data: { slug: `rtok-${ts}`, name: 'Refresh Tokens' } });
  tenantId = tenant.id;
  congregationId = (
    await admin.congregation.create({ data: { tenant_id: tenantId, name: 'Sede' } })
  ).id;
  await admin.tenantPlan.create({
    data: { tenant_id: tenantId, plan: PlanType.premium, status: PlanStatus.trial },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();
}, 120_000);

const DROP_POLICY = 'DROP POLICY IF EXISTS orbien_app_auth ON refresh_tokens';
const CREATE_POLICY = `CREATE POLICY orbien_app_auth ON refresh_tokens
  AS PERMISSIVE FOR ALL TO orbien_app USING (true) WITH CHECK (true)`;
async function setPolicy(presente: boolean) {
  await admin.$executeRawUnsafe(DROP_POLICY);
  if (presente) await admin.$executeRawUnsafe(CREATE_POLICY);
}

afterAll(async () => {
  // Restaura o estado da release 1, aconteça o que acontecer nos testes.
  await setPolicy(true);
  await admin.roleAssignment.deleteMany({ where: { tenant_id: tenantId } });
  await admin.userAccount.deleteMany({ where: { tenant_id: tenantId } });
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe.each([
  ['release 1 — policy orbien_app_auth presente', true],
  ['release 2 — policy orbien_app_auth ausente', false],
])('refresh tokens, %s', (_nome, comPolicy) => {
  beforeAll(async () => {
    await setPolicy(comPolicy);
  });

  it('login grava o token e refresh rotaciona encadeando replaced_by_id', async () => {
    const { id, email } = await criarConta('tenant_admin');
    const p1 = await login(email);
    const r = await refresh(p1.refresh_token).expect(200);
    const p2 = r.body as Par;
    expect(p2.refresh_token).not.toBe(p1.refresh_token);

    const rows = await linhas(id);
    expect(rows).toHaveLength(2);
    expect(rows[0].token_hash).toBe(hashToken(p1.refresh_token));
    expect(rows[0].revoked_at).not.toBeNull();
    expect(rows[0].replaced_by_id).toBe(rows[1].id);
    expect(rows[1].revoked_at).toBeNull();
  });

  it('REUSO de token revogado derruba a família inteira', async () => {
    const { id, email } = await criarConta('tenant_admin');
    const p1 = await login(email);
    const p2 = (await refresh(p1.refresh_token).expect(200)).body as Par;

    await refresh(p1.refresh_token).expect(401); // reuso do já rotacionado
    const vivos = (await linhas(id)).filter((l) => l.revoked_at === null);
    expect(vivos).toHaveLength(0);
    await refresh(p2.refresh_token).expect(401); // o filho caiu junto
  });

  it('duas rotações simultâneas: uma vence, a outra derruba a família', async () => {
    const { id, email } = await criarConta('tenant_admin');
    const p1 = await login(email);
    const [a, b] = await Promise.all([refresh(p1.refresh_token), refresh(p1.refresh_token)]);
    const status = [a.status, b.status].sort();
    // Uma ganha a reivindicação (200); a outra, ou perde a corrida, ou já lê o
    // token revogado — nos dois casos 401 e família revogada.
    expect(status).toEqual([200, 401]);
    expect((await linhas(id)).filter((l) => l.revoked_at === null)).toHaveLength(0);
  });

  it('conta inativa não rotaciona e a família cai', async () => {
    const { id, email } = await criarConta('tenant_admin');
    const p1 = await login(email);
    await admin.userAccount.update({ where: { id }, data: { is_active: false } });
    await refresh(p1.refresh_token).expect(401);
    expect((await linhas(id)).every((l) => l.revoked_at !== null)).toBe(true);
  });

  it('logout revoga o token; hash desconhecido segue idempotente', async () => {
    const { id, email } = await criarConta('tenant_admin');
    const p1 = await login(email);
    const auth = { Authorization: `Bearer ${p1.access_token}` };
    await http()
      .post('/api/auth/logout')
      .set(auth)
      .send({ refresh_token: p1.refresh_token })
      .expect(200);
    expect((await linhas(id))[0].revoked_at).not.toBeNull();
    await http()
      .post('/api/auth/logout')
      .set(auth)
      .send({ refresh_token: 'desconhecido' })
      .expect(200);
  });

  it('login de plataforma emite refresh e ele rotaciona', async () => {
    const { email } = await criarConta('platform_support');
    const p = (
      await http().post('/api/auth/platform/login').send({ email, password: SENHA }).expect(200)
    ).body as Par;
    await refresh(p.refresh_token).expect(200);
  });

  it('a retenção (CONF-02) apaga por expires_at com prisma.system', async () => {
    const { id, email } = await criarConta('tenant_admin');
    await login(email);
    await admin.refreshToken.updateMany({
      where: { user_account_id: id },
      data: { expires_at: new Date(Date.now() - 60 * 24 * 3600 * 1000) },
    });
    const retention = app.get(AuthTokensRetentionService, { strict: false });
    const r = await retention.purgeRefreshTokens(new Date(), [id]);
    expect(r.failed).toBe(false);
    expect(await linhas(id)).toHaveLength(0);
  });
});
