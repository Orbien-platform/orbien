/**
 * `GET /api/platform/audit-logs/support-access` — a tela da Fase 5.
 *
 * O que está sendo prendido, em ordem:
 *
 *   1. quem não é `platform_support` leva 403, como em toda rota de
 *      plataforma;
 *   2. `platform_support` lê linhas de `action: 'support_access'` de
 *      qualquer tenant — é a policy de 005 fazendo o mesmo que 004 fez para
 *      `tenants`;
 *   3. uma linha de `action: 'platform_access'` (rota de plataforma, sem
 *      impersonação) não aparece — o filtro é fixo no backend, não um
 *      parâmetro da query.
 *
 * A linha é inserida direto pelo client privilegiado — o que se está medindo
 * aqui é a leitura, não `audit_insert()`, que já tem cobertura própria em
 * `impersonation.spec.ts`.
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

const SENHA = 'senha-de-teste-audit-logs';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

let app: INestApplication;
let http: () => request.Agent;

const ts = Date.now();
const slugAlvo = `aud-alvo-${ts}`;
const slugSuporte = `aud-plat-${ts}`;

let tenantAlvoId: string;
let congAlvoId: string;
let tenantSuporteId: string;
let congSuporteId: string;
let supportEmail: string;
let comumEmail: string;
let supportUserId: string;

async function login(email: string, slug: string): Promise<string> {
  const res = await http()
    .post('/api/auth/login')
    .send({ email, password: SENHA, tenant_slug: slug })
    .expect(200);
  return (res.body as { access_token: string }).access_token;
}

beforeAll(async () => {
  await ensureRole(admin, 'platform_support', 'Platform Support');
  await ensureRole(admin, 'tenant_admin', 'Admin Tenant');

  const alvo = await admin.tenant.create({ data: { slug: slugAlvo, name: 'Igreja Alvo' } });
  tenantAlvoId = alvo.id;
  const congAlvo = await admin.congregation.create({
    data: { tenant_id: tenantAlvoId, name: 'Igreja Alvo — Sede' },
  });
  congAlvoId = congAlvo.id;
  await admin.tenantPlan.create({
    data: { tenant_id: tenantAlvoId, plan: PlanType.starter, status: PlanStatus.trial },
  });

  const plataforma = await admin.tenant.create({
    data: { slug: slugSuporte, name: 'Tenant da Plataforma' },
  });
  tenantSuporteId = plataforma.id;
  const congSuporte = await admin.congregation.create({
    data: { tenant_id: tenantSuporteId, name: 'Plataforma — Sede' },
  });
  congSuporteId = congSuporte.id;
  await admin.tenantPlan.create({
    data: { tenant_id: tenantSuporteId, plan: PlanType.premium, status: PlanStatus.trial },
  });

  const hash = await argon2.hash(SENHA);

  supportEmail = `suporte-aud-${ts}@orbien.test`;
  const support = await admin.userAccount.create({
    data: {
      tenant_id: tenantSuporteId,
      congregation_id: congSuporteId,
      email: supportEmail,
      password_hash: hash,
    },
  });
  supportUserId = support.id;
  await admin.roleAssignment.create({
    data: {
      tenant_id: tenantSuporteId,
      congregation_id: congSuporteId,
      user_account_id: supportUserId,
      role_code: 'platform_support',
    },
  });

  comumEmail = `comum-aud-${ts}@orbien.test`;
  const comum = await admin.userAccount.create({
    data: {
      tenant_id: tenantSuporteId,
      congregation_id: congSuporteId,
      email: comumEmail,
      password_hash: hash,
    },
  });
  await admin.roleAssignment.create({
    data: {
      tenant_id: tenantSuporteId,
      congregation_id: congSuporteId,
      user_account_id: comum.id,
      role_code: 'tenant_admin',
    },
  });

  // Uma linha de `support_access` do tenant alvo — o que a tela deveria
  // mostrar — e uma de `platform_access` — o que ela NÃO deveria mostrar.
  await admin.auditLog.create({
    data: {
      tenant_id: tenantAlvoId,
      congregation_id: congAlvoId,
      actor_user_id: supportUserId,
      entity: '/api/persons',
      action: 'support_access',
      after: { route: '/api/persons', method: 'GET', status: 200 },
    },
  });
  await admin.auditLog.create({
    data: {
      tenant_id: tenantSuporteId,
      congregation_id: congSuporteId,
      actor_user_id: supportUserId,
      entity: '/api/platform/tenants',
      action: 'platform_access',
      after: { route: '/api/platform/tenants', method: 'GET', status: 200 },
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
  const ids = [tenantAlvoId, tenantSuporteId];
  await admin.auditLog.deleteMany({ where: { tenant_id: { in: ids } } });
  await admin.roleAssignment.deleteMany({ where: { tenant_id: { in: ids } } });
  await admin.tenant.deleteMany({ where: { id: { in: ids } } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('GET /api/platform/audit-logs/support-access', () => {
  it('exige autenticação', async () => {
    await http().get('/api/platform/audit-logs/support-access').expect(401);
  });

  it('barra quem não é platform_support', async () => {
    const token = await login(comumEmail, slugSuporte);
    await http()
      .get('/api/platform/audit-logs/support-access')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('platform_support lê a linha de support_access, de qualquer tenant', async () => {
    const token = await login(supportEmail, slugSuporte);
    const res = await http()
      .get('/api/platform/audit-logs/support-access')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const linhas = res.body.data as {
      tenant_id: string;
      route: string;
      actor_email: string;
    }[];
    const doAlvo = linhas.find((l) => l.tenant_id === tenantAlvoId);
    expect(doAlvo).toBeDefined();
    expect(doAlvo?.route).toBe('/api/persons');
    expect(doAlvo?.actor_email).toBe(supportEmail);
  });

  it('não devolve linhas de platform_access — o filtro é fixo, não um parâmetro', async () => {
    const token = await login(supportEmail, slugSuporte);
    const res = await http()
      .get('/api/platform/audit-logs/support-access')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const linhas = res.body.data as { action?: string; entity: string }[];
    expect(linhas.some((l) => l.entity === '/api/platform/tenants')).toBe(false);
  });
});
