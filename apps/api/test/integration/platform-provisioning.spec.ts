/**
 * Provisionamento de tenant, do login ao dado no banco.
 *
 * A Fase 2 é feita de três marcas que só funcionam juntas —
 * `@Roles('platform_support')`, `@PlatformRoute()` e o
 * `TenantContextInterceptor` — e nenhum teste de unidade prova que elas se
 * encontram numa requisição HTTP de verdade. Os specs de unidade provam cada
 * decisão isolada; a suíte de RLS prova a policy. É aqui que o caminho inteiro
 * é medido, e é aqui que uma marca faltando aparece.
 *
 * O que está sendo prendido, em ordem:
 *
 *   1. quem não é `platform_support` leva 403 na rota de plataforma;
 *   2. `platform_support` provisiona, e as seis peças existem no banco;
 *   3. o admin criado consegue logar — se a senha não foi gravada como hash
 *      utilizável, é aqui que se descobre, não no primeiro cliente;
 *   4. a rota deixa `platform_access` em `audit_logs`, com o tenant criado;
 *   5. slug repetido vira 409.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlanStatus, PlanType, PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const SENHA = 'senha-de-teste-provisioning';
const SENHA_NOVO_ADMIN = 'senha-do-admin-novo';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

let app: INestApplication;
let http: () => request.Agent;

const ts = Date.now();
const slugPlataforma = `prov-plat-${ts}`;
const slugNovo = `prov-novo-${ts}`;

let tenantPlataformaId: string;
let congPlataformaId: string;
let supportEmail: string;
let comumEmail: string;
let tenantNovoId: string;

async function login(email: string, senha: string, slug: string): Promise<string> {
  const res = await http()
    .post('/api/auth/login')
    .send({ email, password: senha, tenant_slug: slug })
    .expect(200);

  return (res.body as { access_token: string }).access_token;
}

beforeAll(async () => {
  // `createMany` com `skipDuplicates`, e não `upsert`: as suítes de integração
  // rodam em paralelo sob `test:cov` (só `test:integration` usa --runInBand) e
  // todas semeiam os mesmos papéis. `upsert` faz find-then-create, então duas
  // workers que não acham a linha criam as duas e a segunda morre com P2002.
  // `createMany` vira um INSERT ... ON CONFLICT DO NOTHING — uma ida, sem
  // janela de corrida.
  await admin.role.createMany({
    data: [
      { code: 'platform_support', name: 'Platform Support' },
      { code: 'tenant_admin', name: 'Admin Tenant' },
    ],
    skipDuplicates: true,
  });

  const tenant = await admin.tenant.create({
    data: { slug: slugPlataforma, name: 'Tenant da Plataforma' },
  });
  tenantPlataformaId = tenant.id;

  const cong = await admin.congregation.create({
    data: { tenant_id: tenantPlataformaId, name: 'Plataforma — Sede' },
  });
  congPlataformaId = cong.id;

  await admin.tenantPlan.create({
    data: { tenant_id: tenantPlataformaId, plan: PlanType.premium, status: PlanStatus.trial },
  });

  const hash = await argon2.hash(SENHA);

  supportEmail = `suporte-prov-${ts}@orbien.test`;
  const support = await admin.userAccount.create({
    data: {
      tenant_id: tenantPlataformaId,
      congregation_id: congPlataformaId,
      email: supportEmail,
      password_hash: hash,
    },
  });

  comumEmail = `comum-prov-${ts}@orbien.test`;
  const comum = await admin.userAccount.create({
    data: {
      tenant_id: tenantPlataformaId,
      congregation_id: congPlataformaId,
      email: comumEmail,
      password_hash: hash,
    },
  });

  await admin.roleAssignment.createMany({
    data: [
      {
        tenant_id: tenantPlataformaId,
        congregation_id: congPlataformaId,
        user_account_id: support.id,
        role_code: 'platform_support',
      },
      {
        tenant_id: tenantPlataformaId,
        congregation_id: congPlataformaId,
        user_account_id: comum.id,
        role_code: 'tenant_admin',
      },
    ],
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
  const ids = [tenantPlataformaId, tenantNovoId].filter(Boolean);
  await admin.auditLog.deleteMany({ where: { tenant_id: { in: ids } } });
  await admin.roleAssignment.deleteMany({ where: { tenant_id: { in: ids } } });
  await admin.tenant.deleteMany({ where: { id: { in: ids } } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

const payload = {
  slug: '',
  name: 'Igreja Provisionada',
  congregation_name: 'Igreja Provisionada — Sede',
  admin_email: '',
  admin_password: SENHA_NOVO_ADMIN,
};

describe('POST /api/platform/tenants', () => {
  it('barra quem não é platform_support', async () => {
    const token = await login(comumEmail, SENHA, slugPlataforma);

    await http()
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, slug: `${slugNovo}-negado`, admin_email: `a-${ts}@nova.test` })
      .expect(403);
  });

  it('exige autenticação', async () => {
    await http().post('/api/platform/tenants').send(payload).expect(401);
  });

  it('provisiona o tenant inteiro numa chamada', async () => {
    const token = await login(supportEmail, SENHA, slugPlataforma);

    const res = await http()
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, slug: slugNovo, admin_email: `pastor-${ts}@nova.test` })
      .expect(201);

    const body = res.body as { tenant_id: string; congregation_id: string };
    tenantNovoId = body.tenant_id;

    const criado = await admin.tenant.findUniqueOrThrow({
      where: { id: tenantNovoId },
      include: {
        tenantPlan: true,
        brandingConfig: true,
        congregations: true,
        userAccounts: true,
        roleAssignments: true,
      },
    });

    expect(criado.slug).toBe(slugNovo);
    expect(criado.tenantPlan?.status).toBe(PlanStatus.trial);
    expect(criado.brandingConfig?.app_name).toBe('Igreja Provisionada');
    expect(criado.congregations).toHaveLength(1);
    expect(criado.userAccounts).toHaveLength(1);
    expect(criado.roleAssignments[0]?.role_code).toBe('tenant_admin');
  });

  it('o admin criado consegue logar no tenant novo', async () => {
    const token = await login(`pastor-${ts}@nova.test`, SENHA_NOVO_ADMIN, slugNovo);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('deixa platform_access em audit_logs, com o tenant criado', async () => {
    const linhas = await admin.auditLog.findMany({
      where: { tenant_id: tenantPlataformaId, action: 'platform_access' },
    });

    const provisionamento = linhas.find((l) => l.entity === '/api/platform/tenants');
    expect(provisionamento).toBeDefined();
    expect((provisionamento?.after as { subject_tenant_id?: string })?.subject_tenant_id).toBe(
      tenantNovoId,
    );
  });

  it('slug repetido responde 409', async () => {
    const token = await login(supportEmail, SENHA, slugPlataforma);

    await http()
      .post('/api/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, slug: slugNovo, admin_email: `outro-${ts}@nova.test` })
      .expect(409);
  });
});

/**
 * A listagem é a outra metade do par: `POST` cria, `GET` é o que o
 * `apps/admin` mostra. Ela carrega as mesmas três marcas, e é o `@PlatformRoute()`
 * que decide se ela devolve os N tenants ou um só — sem ele o interceptor fixa
 * `app.tenant_id` e o ramo `app_platform_access()` fecha, sem erro nenhum.
 * Por isso o teste não checa "devolve alguma coisa": checa que o tenant da
 * plataforma **e** o tenant criado aparecem juntos na mesma resposta.
 */
describe('GET /api/platform/tenants', () => {
  it('exige autenticação', async () => {
    await http().get('/api/platform/tenants').expect(401);
  });

  it('barra quem não é platform_support', async () => {
    const token = await login(comumEmail, SENHA, slugPlataforma);

    await http()
      .get('/api/platform/tenants')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('atravessa tenants: lista o da plataforma e o provisionado juntos', async () => {
    const token = await login(supportEmail, SENHA, slugPlataforma);

    const res = await http()
      .get('/api/platform/tenants?limit=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as {
      data: { id: string; slug: string; congregations_count: number }[];
      total: number;
      page: number;
      limit: number;
    };

    const ids = body.data.map((t) => t.id);
    expect(ids).toContain(tenantPlataformaId);
    expect(ids).toContain(tenantNovoId);
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body).toMatchObject({ page: 1, limit: 100 });

    const novo = body.data.find((t) => t.id === tenantNovoId);
    expect(novo?.slug).toBe(slugNovo);
    expect(novo?.congregations_count).toBe(1);
  });

  it('a busca filtra por slug', async () => {
    const token = await login(supportEmail, SENHA, slugPlataforma);

    const res = await http()
      .get(`/api/platform/tenants?search=${slugNovo}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = res.body as { data: { id: string }[]; total: number };
    expect(body.data.map((t) => t.id)).toEqual([tenantNovoId]);
    expect(body.total).toBe(1);
  });

  it('limit acima do teto é rejeitado', async () => {
    const token = await login(supportEmail, SENHA, slugPlataforma);

    await http()
      .get('/api/platform/tenants?limit=1000')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });
});
