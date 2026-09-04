/**
 * Login do console da plataforma, sem `tenant_slug`.
 *
 * O que está sendo prendido:
 *
 *   1. `platform_support` entra só com e-mail e senha, e o token serve para as
 *      rotas de plataforma — o papel tem que chegar no `roles` do JWT, senão o
 *      `RolesGuard` devolve 403 e o login não leva a nada;
 *   2. senha errada, conta sem o papel e conta inativa devolvem o **mesmo**
 *      401 — credencial válida de `tenant_admin` não deve descobrir pela
 *      mensagem que serve em outro lugar;
 *   3. o token carrega o tenant de origem da conta, e é ele que aparece em
 *      `audit_logs.tenant_id`. Essa coluna é NOT NULL com FK para `tenants`;
 *      um token sem tenant faria toda linha `platform_access` falhar no INSERT
 *      — e a auditoria é best-effort, então cairia em silêncio. É o desenho da
 *      pendência nº 6, e é o que este teste não deixa regredir;
 *   4. o mesmo e-mail com o papel em dois tenants é erro de configuração e
 *      falha alto, em vez de escolher um tenant em silêncio.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlanStatus, PlanType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ensureRole } from '../helpers/rls';

const SENHA = 'senha-de-teste-platform-login';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

let app: INestApplication;
let http: () => request.Agent;

const ts = Date.now();

let tenantAId: string;
let tenantBId: string;
let supportEmail: string;
let supportUserId: string;
let comumEmail: string;
let inativoEmail: string;
let duplicadoEmail: string;
let outraCongEmail: string;

/** Cria tenant + congregação + plano, e devolve os dois ids. */
async function criarTenant(slug: string, nome: string) {
  const tenant = await admin.tenant.create({ data: { slug, name: nome } });
  const cong = await admin.congregation.create({
    data: { tenant_id: tenant.id, name: `${nome} — Sede` },
  });
  await admin.tenantPlan.create({
    data: { tenant_id: tenant.id, plan: PlanType.premium, status: PlanStatus.trial },
  });
  return { tenantId: tenant.id, congregationId: cong.id };
}

async function criarConta(
  tenantId: string,
  congregationId: string,
  email: string,
  roleCode: string | null,
  isActive = true,
): Promise<string> {
  const conta = await admin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      email,
      password_hash: await argon2.hash(SENHA),
      is_active: isActive,
    },
  });
  if (roleCode) {
    await admin.roleAssignment.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        user_account_id: conta.id,
        role_code: roleCode,
      },
    });
  }
  return conta.id;
}

function platformLogin(email: string, password: string) {
  return http().post('/api/auth/platform/login').send({ email, password });
}

beforeAll(async () => {
  // `ensureRole` e não `upsert`: as suítes de integração rodam em paralelo sob
  // `test:cov` (só `test:integration` usa --runInBand) e todas semeiam os
  // mesmos papéis. `upsert` faz find-then-create, então duas workers que não
  // acham a linha criam as duas e a segunda morre com P2002. O helper é um
  // `INSERT ... ON CONFLICT DO NOTHING`, sem janela.
  await ensureRole(admin, 'platform_support', 'Platform Support');
  await ensureRole(admin, 'tenant_admin', 'Admin Tenant');

  const a = await criarTenant(`plogin-a-${ts}`, 'Tenant A');
  const b = await criarTenant(`plogin-b-${ts}`, 'Tenant B');
  tenantAId = a.tenantId;
  tenantBId = b.tenantId;

  supportEmail = `suporte-plogin-${ts}@orbien.test`;
  supportUserId = await criarConta(
    a.tenantId,
    a.congregationId,
    supportEmail,
    'platform_support',
  );

  comumEmail = `comum-plogin-${ts}@orbien.test`;
  await criarConta(a.tenantId, a.congregationId, comumEmail, 'tenant_admin');

  inativoEmail = `inativo-plogin-${ts}@orbien.test`;
  await criarConta(
    a.tenantId,
    a.congregationId,
    inativoEmail,
    'platform_support',
    false,
  );

  // Mesmo e-mail, mesma senha, `platform_support` nos dois tenants. A unique
  // de `user_accounts` é por (tenant_id, email), então isto é permitido pelo
  // schema — e é exatamente a ambiguidade que a rota tem que recusar.
  duplicadoEmail = `duplicado-plogin-${ts}@orbien.test`;
  await criarConta(a.tenantId, a.congregationId, duplicadoEmail, 'platform_support');
  await criarConta(b.tenantId, b.congregationId, duplicadoEmail, 'platform_support');

  // Conta cuja atribuição de `platform_support` está em OUTRA congregação do
  // mesmo tenant. `platform_support` é global — `app_is_platform_support()`
  // não filtra por tenant nem por congregação — mas o token era montado com
  // filtro de congregação, e nesse arranjo o papel sumia do JWT.
  const outraCong = await admin.congregation.create({
    data: { tenant_id: a.tenantId, name: 'Tenant A — Filial' },
  });
  outraCongEmail = `outra-cong-plogin-${ts}@orbien.test`;
  const outraCongConta = await admin.userAccount.create({
    data: {
      tenant_id: a.tenantId,
      congregation_id: a.congregationId,
      email: outraCongEmail,
      password_hash: await argon2.hash(SENHA),
    },
  });
  await admin.roleAssignment.create({
    data: {
      tenant_id: a.tenantId,
      congregation_id: outraCong.id,
      user_account_id: outraCongConta.id,
      role_code: 'platform_support',
    },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  http = () => request(app.getHttpServer());
}, 120_000);

afterAll(async () => {
  const ids = [tenantAId, tenantBId].filter(Boolean);
  await admin.auditLog.deleteMany({ where: { tenant_id: { in: ids } } });
  await admin.roleAssignment.deleteMany({ where: { tenant_id: { in: ids } } });
  await admin.tenant.deleteMany({ where: { id: { in: ids } } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('POST /api/auth/platform/login', () => {
  it('entra sem tenant_slug e o token serve para a rota de plataforma', async () => {
    const res = await platformLogin(supportEmail, SENHA).expect(200);

    const body = res.body as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
    expect(typeof body.access_token).toBe('string');
    expect(typeof body.refresh_token).toBe('string');
    expect(body.expires_in).toBe(900);

    // O 200 aqui é o que prova que `platform_support` chegou no `roles` do
    // token: sem ele o `RolesGuard` recusaria com 403.
    await http()
      .get('/api/platform/tenants?limit=100')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(200);
  });

  it('recusa tenant_slug no corpo — a rota não tem esse campo', async () => {
    await http()
      .post('/api/auth/platform/login')
      .send({ email: supportEmail, password: SENHA, tenant_slug: `plogin-a-${ts}` })
      .expect(400);
  });

  it('senha errada devolve 401', async () => {
    const res = await platformLogin(supportEmail, 'senha-errada').expect(401);
    expect((res.body as { code?: string }).code).toBe('INVALID_CREDENTIALS');
  });

  // O ponto não é o status, é a indistinguibilidade: mesma resposta da senha
  // errada. Mensagem diferente aqui contaria que a credencial é boa em outro
  // lugar.
  it('conta sem platform_support devolve o mesmo 401, com a senha certa', async () => {
    const res = await platformLogin(comumEmail, SENHA).expect(401);
    expect((res.body as { code?: string }).code).toBe('INVALID_CREDENTIALS');
  });

  it('conta inativa devolve o mesmo 401', async () => {
    const res = await platformLogin(inativoEmail, SENHA).expect(401);
    expect((res.body as { code?: string }).code).toBe('INVALID_CREDENTIALS');
  });

  it('e-mail desconhecido devolve o mesmo 401', async () => {
    const res = await platformLogin(`nao-existe-${ts}@orbien.test`, SENHA).expect(401);
    expect((res.body as { code?: string }).code).toBe('INVALID_CREDENTIALS');
  });

  it('papel de plataforma em dois tenants falha alto, não escolhe um', async () => {
    const res = await platformLogin(duplicadoEmail, SENHA).expect(409);
    expect((res.body as { code?: string }).code).toBe('PLATFORM_ACCOUNT_AMBIGUOUS');
  });

  // Sem a união em `rolesForToken`, o papel sumia do token neste arranjo e a
  // rota de plataforma respondia 403 — login bem-sucedido levando a nada.
  it('papel atribuído em outra congregação do tenant continua valendo', async () => {
    const res = await platformLogin(outraCongEmail, SENHA).expect(200);
    const body = res.body as { access_token: string; refresh_token: string };

    await http()
      .get('/api/platform/tenants?limit=100')
      .set('Authorization', `Bearer ${body.access_token}`)
      .expect(200);

    // E sobrevive à renovação: o console vive de refresh a cada 15 minutos, e
    // um refresh que perde o papel derruba a sessão sem motivo aparente.
    const renovado = await http()
      .post('/api/auth/refresh')
      .send({ refresh_token: body.refresh_token })
      .expect(200);

    await http()
      .get('/api/platform/tenants?limit=100')
      .set('Authorization', `Bearer ${(renovado.body as { access_token: string }).access_token}`)
      .expect(200);
  });

  it('a auditoria da rota de plataforma sai com o tenant de origem da conta', async () => {
    const res = await platformLogin(supportEmail, SENHA).expect(200);
    const token = (res.body as { access_token: string }).access_token;

    await http()
      .get('/api/platform/tenants?limit=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // A escrita em audit_logs é best-effort e assíncrona ao pipe do
    // interceptor: ela sai depois da resposta. Espera curta em vez de sleep
    // fixo, para o teste não ficar pendurado quando a linha já está lá.
    let linha = null;
    for (let tentativa = 0; tentativa < 20 && !linha; tentativa++) {
      linha = await admin.auditLog.findFirst({
        where: {
          tenant_id: tenantAId,
          action: 'platform_access',
          entity: '/api/platform/tenants',
        },
      });
      if (!linha) await new Promise((r) => setTimeout(r, 100));
    }

    // `tenant_id` é NOT NULL com FK para `tenants`. Se o token de plataforma
    // não carregasse tenant, esta linha não existiria — e ninguém veria.
    expect(linha).not.toBeNull();
    expect(linha!.tenant_id).toBe(tenantAId);
    expect(linha!.actor_user_id).toBe(supportUserId);
  });
});
