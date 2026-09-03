/**
 * Sessão de suporte: do login do `platform_support` até o dado do tenant alvo.
 *
 * Este é o primeiro teste do projeto `integration` — ele sobe o `AppModule` de
 * verdade, com os mesmos pipes globais do `main.ts`, e fala HTTP. É aqui que a
 * exceção do `RolesGuard` tem que ser medida: o teste de unidade do guard prova
 * a decisão isolada, mas não prova que o token que a `impersonate` emite chega
 * ao handler com a marca certa, nem que o RLS deixa o dado passar depois.
 *
 * O que está sendo prendido, em ordem:
 *
 *   1. `platform_support` leva 403 nas rotas de dados — o comportamento que
 *      deu origem a tudo isso continua valendo. A exceção é da sessão, não do
 *      papel.
 *   2. `POST /auth/impersonate` emite token para o tenant alvo.
 *   3. Com esse token, a mesma rota responde 200 e devolve o dado do alvo.
 *   4. Cada requisição em sessão de suporte deixa uma linha em `audit_logs`.
 *   5. A sessão não cruza tenant: o token traz um tenant só, e o RLS o fixa.
 *
 * Fixtures são criadas e removidas com o client privilegiado, como na suíte de
 * RLS. As asserções passam por HTTP, ou seja pelo `orbien_app` com RLS ativo.
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

const SENHA = 'senha-de-teste-integration';

// Client privilegiado, só para montar e desmontar fixtures — nunca para
// asserção, que é o que a suíte de RLS também faz.
const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

let app: INestApplication;
let http: () => request.Agent;

const ts = Date.now();
const slugSuporte = `imp-plat-${ts}`;
const slugAlvo = `imp-alvo-${ts}`;

let tenantSuporteId: string;
let tenantAlvoId: string;
let congSuporteId: string;
let congAlvoId: string;
let supportUserId: string;
let pessoaAlvoNome: string;

async function criarTenant(slug: string, nome: string) {
  const tenant = await admin.tenant.create({ data: { slug, name: nome } });
  const congregation = await admin.congregation.create({
    data: { tenant_id: tenant.id, name: `${nome} — Sede` },
  });
  await admin.tenantPlan.create({
    data: { tenant_id: tenant.id, plan: PlanType.starter, status: PlanStatus.trial },
  });
  return { tenantId: tenant.id, congregationId: congregation.id };
}

beforeAll(async () => {
  // `role_code` é FK para `roles.code` com ON DELETE RESTRICT: o papel precisa
  // existir. O bootstrap --seed já o cria; isto deixa a suíte independente.
  await ensureRole(admin, 'platform_support', 'Platform Support');

  const suporte = await criarTenant(slugSuporte, 'Tenant da Plataforma');
  tenantSuporteId = suporte.tenantId;
  congSuporteId = suporte.congregationId;

  const alvo = await criarTenant(slugAlvo, 'Igreja Alvo');
  tenantAlvoId = alvo.tenantId;
  congAlvoId = alvo.congregationId;

  const support = await admin.userAccount.create({
    data: {
      tenant_id: tenantSuporteId,
      congregation_id: congSuporteId,
      email: `suporte-${ts}@orbien.test`,
      password_hash: await argon2.hash(SENHA),
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

  // Dado que só existe no tenant alvo — é o que a sessão de suporte tem que
  // conseguir ler, e é o que prova que o token trocou de tenant.
  pessoaAlvoNome = `Pessoa do Alvo ${ts}`;
  await admin.person.create({
    data: {
      tenant_id: tenantAlvoId,
      congregation_id: congAlvoId,
      full_name: pessoaAlvoNome,
      classification: 'member',
      gender: 'female',
    },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  // Mesmos pipes do main.ts: sem isso o ValidationPipe não roda e o teste
  // mediria um app diferente do que vai para produção.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  http = () => request(app.getHttpServer());
}, 120_000);

afterAll(async () => {
  await admin.auditLog.deleteMany({
    where: { tenant_id: { in: [tenantSuporteId, tenantAlvoId] } },
  });
  await admin.roleAssignment.deleteMany({
    where: { tenant_id: { in: [tenantSuporteId, tenantAlvoId] } },
  });
  await admin.tenant.deleteMany({ where: { id: { in: [tenantSuporteId, tenantAlvoId] } } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

async function loginSuporte(): Promise<string> {
  const res = await http()
    .post('/api/auth/login')
    .send({ email: `suporte-${ts}@orbien.test`, password: SENHA, tenant_slug: slugSuporte })
    .expect(200);
  return res.body.access_token as string;
}

describe('sessão de suporte', () => {
  it('platform_support faz login e recebe só o próprio papel', async () => {
    const token = await loginSuporte();
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    expect(payload.roles).toEqual(['platform_support']);
    expect(payload.tenant_id).toBe(tenantSuporteId);
    expect(payload.support_session).toBeUndefined();
  });

  it('sem impersonar, leva 403 nas rotas de dados de igreja', async () => {
    const token = await loginSuporte();
    for (const rota of ['/api/persons?limit=10', '/api/celebrations']) {
      await http().get(rota).set('Authorization', `Bearer ${token}`).expect(403);
    }
  });

  it('impersonate emite token do tenant alvo, marcado como sessão de suporte', async () => {
    const token = await loginSuporte();
    const res = await http()
      .post('/api/auth/impersonate')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_tenant_id: tenantAlvoId })
      .expect(200);

    const payload = JSON.parse(
      Buffer.from((res.body.access_token as string).split('.')[1], 'base64').toString(),
    );
    expect(payload.tenant_id).toBe(tenantAlvoId);
    expect(payload.congregation_id).toBe(congAlvoId);
    expect(payload.support_session).toBe(true);
    expect(payload.impersonated_by).toBe(supportUserId);
    // Os papéis seguem sendo os do suporte: a exceção do guard é a marca da
    // sessão, não um papel forjado no tenant alvo.
    expect(payload.roles).toEqual(['platform_support']);
  });

  it('com o token impersonado, lê o dado do tenant alvo', async () => {
    const token = await loginSuporte();
    const imp = await http()
      .post('/api/auth/impersonate')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_tenant_id: tenantAlvoId })
      .expect(200);

    const res = await http()
      .get('/api/persons?limit=100')
      .set('Authorization', `Bearer ${imp.body.access_token}`)
      .expect(200);

    const nomes = (res.body.data as { full_name: string }[]).map((p) => p.full_name);
    expect(nomes).toContain(pessoaAlvoNome);
  });

  it('não cruza tenant: só o alvo aparece, nunca o tenant do suporte', async () => {
    // O tenant do suporte não tem pessoas, então a asserção útil é sobre o
    // congregation_id: tudo que voltar tem que ser da congregação do alvo.
    const token = await loginSuporte();
    const imp = await http()
      .post('/api/auth/impersonate')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_tenant_id: tenantAlvoId })
      .expect(200);

    const res = await http()
      .get('/api/persons?limit=100')
      .set('Authorization', `Bearer ${imp.body.access_token}`)
      .expect(200);

    const congs = new Set(
      (res.body.data as { congregation_id: string }[]).map((p) => p.congregation_id),
    );
    expect([...congs]).toEqual([congAlvoId]);
  });

  it('cada requisição da sessão deixa rastro em audit_logs', async () => {
    const antes = await admin.auditLog.count({
      where: { tenant_id: tenantAlvoId, action: 'support_access' },
    });

    const token = await loginSuporte();
    const imp = await http()
      .post('/api/auth/impersonate')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_tenant_id: tenantAlvoId })
      .expect(200);

    await http()
      .get('/api/persons?limit=100')
      .set('Authorization', `Bearer ${imp.body.access_token}`)
      .expect(200);

    // A escrita é best-effort e sai do pipe do interceptor, então não está
    // concluída quando a resposta HTTP chega. Espera por estado, não por tempo.
    let depois = antes;
    for (let i = 0; i < 40 && depois === antes; i++) {
      await new Promise((r) => setTimeout(r, 250));
      depois = await admin.auditLog.count({
        where: { tenant_id: tenantAlvoId, action: 'support_access' },
      });
    }
    expect(depois).toBeGreaterThan(antes);

    const linha = await admin.auditLog.findFirst({
      where: { tenant_id: tenantAlvoId, action: 'support_access' },
      orderBy: { at: 'desc' },
    });
    // O ator é o usuário de suporte, não a conta do tenant alvo — é isso que
    // torna o rastro útil quando alguém perguntar quem mexeu.
    expect(linha?.actor_user_id).toBe(supportUserId);
    expect(linha?.congregation_id).toBe(congAlvoId);
    expect(linha?.entity).toContain('/api/persons');
  }, 30_000);

  it('tenant inexistente é recusado', async () => {
    const token = await loginSuporte();
    await http()
      .post('/api/auth/impersonate')
      .set('Authorization', `Bearer ${token}`)
      .send({ target_tenant_id: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
  });
});
