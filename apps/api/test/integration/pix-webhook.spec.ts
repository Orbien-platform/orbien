/**
 * O webhook da Asaas, por HTTP, contra o banco.
 *
 * Esta é a suíte que faltava: `pix.service.spec.ts` mocka o Prisma, e por isso
 * não via que o webhook — rota pública, `orbien_app`, sem `app.tenant_id` —
 * recebia zero linhas de `pix_payments` da RLS e descartava toda confirmação
 * com 200. Aqui a RLS é a real.
 *
 * Só `teste2-church` (Premium) e `teste1-church`, como prescreve
 * `docs/AMBIENTES.md`. O que o teste cria é apagado no `afterAll`.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend -- pix-webhook
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { loadTestTenant, TestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });

const TOKEN = `segredo-${Date.now()}`;
const ts = Date.now();
const startedAt = new Date();

let app: INestApplication;
let t1: TestTenant;
let t2: TestTenant;
let donorId: string;
let creatorId: string;
const paymentIds: string[] = [];
const subscriptionIds: string[] = [];

/** `token: null` não manda o cabeçalho; omitido, manda o token certo. */
function webhook(body: Record<string, unknown>, token: string | null = TOKEN) {
  const req = request(app.getHttpServer()).post('/api/financial/pix/webhook');
  return (token ? req.set('asaas-access-token', token) : req).send(body);
}

function confirmed(asaasId: string, extra: Record<string, unknown> = {}) {
  return { event: 'PAYMENT_CONFIRMED', payment: { id: asaasId, ...extra } };
}

async function newPendingPayment(tag: string, tenant: TestTenant = t2) {
  const asaasId = `wh-${tag}-${ts}`;
  const row = await admin.pixPayment.create({
    data: {
      tenant_id: tenant.tenantId,
      congregation_id: tenant.congregationId,
      scenario: 'dynamic',
      status: 'pending',
      amount: '50.00',
      asaas_payment_id: asaasId,
      category_id: tenant.ofertaCategoryId,
    },
  });
  paymentIds.push(row.id);
  return { asaasId, id: row.id };
}

function pixTransactions(tenant: TestTenant) {
  return admin.financialTransaction.findMany({
    where: { tenant_id: tenant.tenantId, source: 'pix_webhook', created_at: { gte: startedAt } },
  });
}

beforeAll(async () => {
  process.env['ASAAS_WEBHOOK_TOKEN'] = TOKEN;

  t1 = await loadTestTenant(admin, 'teste1-church');
  t2 = await loadTestTenant(admin, 'teste2-church');

  donorId = (
    await admin.person.create({
      data: {
        tenant_id: t2.tenantId,
        congregation_id: t2.congregationId,
        full_name: `Dizimista webhook ${ts}`,
        classification: 'member',
        gender: 'female',
      },
    })
  ).id;
  creatorId = (
    await admin.userAccount.findFirstOrThrow({ where: { tenant_id: t2.tenantId }, select: { id: true } })
  ).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();
}, 120_000);

afterAll(async () => {
  await admin.financialTransaction.deleteMany({
    where: { tenant_id: { in: [t1.tenantId, t2.tenantId] }, source: 'pix_webhook', created_at: { gte: startedAt } },
  });
  await admin.auditLog.deleteMany({
    where: { tenant_id: { in: [t1.tenantId, t2.tenantId] }, action: 'pix.confirmed', at: { gte: startedAt } },
  });
  await admin.pixPayment.deleteMany({
    where: { OR: [{ id: { in: paymentIds } }, { pix_subscription_id: { in: subscriptionIds } }] },
  });
  await admin.pixSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  await admin.person.deleteMany({ where: { id: donorId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('POST /api/financial/pix/webhook — sob a RLS real', () => {
  it('confirma o pagamento e cria 1 lançamento de receita no tenant e na categoria da linha', async () => {
    const { asaasId, id } = await newPendingPayment('ok');

    const res = await webhook(confirmed(asaasId, { value: 75.5 }));

    expect(res.status).toBe(200);
    const row = await admin.pixPayment.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('confirmed');
    expect(row.paid_at).not.toBeNull();

    const txs = (await pixTransactions(t2)).filter((t) => t.category_id === t2.ofertaCategoryId);
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      tenant_id: t2.tenantId,
      congregation_id: t2.congregationId,
      type: 'income',
      source: 'pix_webhook',
      category_id: t2.ofertaCategoryId,
    });
    expect(String(txs[0].amount)).toBe('75.5');
  });

  it('não escreve nada no outro tenant de teste', async () => {
    expect(await pixTransactions(t1)).toHaveLength(0);
  });

  it('é idempotente: reenvio e PAYMENT_RECEIVED depois de PAYMENT_CONFIRMED não duplicam o lançamento', async () => {
    const { asaasId } = await newPendingPayment('idem');
    const antes = (await pixTransactions(t2)).length;

    await webhook(confirmed(asaasId)).expect(200);
    await webhook(confirmed(asaasId)).expect(200);
    await webhook({ event: 'PAYMENT_RECEIVED', payment: { id: asaasId } }).expect(200);

    expect((await pixTransactions(t2)).length).toBe(antes + 1);
  });

  it('entregas simultâneas do mesmo pagamento criam um único lançamento', async () => {
    const { asaasId } = await newPendingPayment('corrida');
    const antes = (await pixTransactions(t2)).length;

    const respostas = await Promise.all([
      webhook(confirmed(asaasId)),
      webhook({ event: 'PAYMENT_RECEIVED', payment: { id: asaasId } }),
      webhook(confirmed(asaasId)),
    ]);

    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect((await pixTransactions(t2)).length).toBe(antes + 1);
  });

  it('id da Asaas desconhecido responde 200 sem criar nada', async () => {
    const antes = (await pixTransactions(t2)).length;

    await webhook(confirmed(`nao-existe-${ts}`)).expect(200);

    expect((await pixTransactions(t2)).length).toBe(antes);
  });

  it('token errado é 401 e a linha continua pendente', async () => {
    const { asaasId, id } = await newPendingPayment('token');

    await webhook(confirmed(asaasId), 'token-errado').expect(401);
    await webhook(confirmed(asaasId), null).expect(401);

    const row = await admin.pixPayment.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('pending');
  });

  it('escreve o rastro de auditoria da confirmação', async () => {
    const { asaasId } = await newPendingPayment('audit');

    await webhook(confirmed(asaasId)).expect(200);

    const logs = await admin.auditLog.findMany({
      where: { tenant_id: t2.tenantId, action: 'pix.confirmed', at: { gte: startedAt } },
    });
    expect(logs.some((l) => JSON.stringify(l.after).includes(asaasId))).toBe(true);
  });

  describe('PIX recorrente (PROD-27): a cobrança nasce na Asaas e a primeira notícia é o webhook', () => {
    async function newSubscription(tag: string, status: 'active' | 'cancelled') {
      const asaasSub = `wh-sub-${tag}-${ts}`;
      const sub = await admin.pixSubscription.create({
        data: {
          tenant_id: t2.tenantId,
          congregation_id: t2.congregationId,
          donor_person_id: donorId,
          category_id: t2.ofertaCategoryId,
          amount: '30.00',
          asaas_subscription_id: asaasSub,
          status,
          created_by_user_id: creatorId,
        },
      });
      subscriptionIds.push(sub.id);
      return { asaasSub, id: sub.id };
    }

    it('materializa a linha sob o tenant da assinatura, confirma e lança com o doador', async () => {
      const { asaasSub, id } = await newSubscription('ativa', 'active');
      const asaasPay = `wh-rec-${ts}`;

      await webhook(confirmed(asaasPay, { subscription: asaasSub, value: 30 })).expect(200);

      const rows = await admin.pixPayment.findMany({ where: { asaas_payment_id: asaasPay } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        tenant_id: t2.tenantId,
        congregation_id: t2.congregationId,
        scenario: 'recurring',
        status: 'confirmed',
        pix_subscription_id: id,
        donor_person_id: donorId,
      });
      const txs = (await pixTransactions(t2)).filter((t) => t.donor_person_id === donorId);
      expect(txs).toHaveLength(1);
    });

    it('duas entregas simultâneas da MESMA cobrança nova não falham e lançam uma vez', async () => {
      const { asaasSub } = await newSubscription('corrida', 'active');
      const asaasPay = `wh-rec-corrida-${ts}`;
      const antes = (await pixTransactions(t2)).length;

      const respostas = await Promise.all([
        webhook(confirmed(asaasPay, { subscription: asaasSub })),
        webhook(confirmed(asaasPay, { subscription: asaasSub })),
      ]);

      expect(respostas.map((r) => r.status)).toEqual([200, 200]);
      expect(await admin.pixPayment.count({ where: { asaas_payment_id: asaasPay } })).toBe(1);
      expect((await pixTransactions(t2)).length).toBe(antes + 1);
    });

    it('assinatura cancelada não gera lançamento', async () => {
      const { asaasSub } = await newSubscription('cancelada', 'cancelled');
      const asaasPay = `wh-rec-cancelada-${ts}`;
      const antes = (await pixTransactions(t2)).length;

      await webhook(confirmed(asaasPay, { subscription: asaasSub })).expect(200);

      expect(await admin.pixPayment.count({ where: { asaas_payment_id: asaasPay } })).toBe(0);
      expect((await pixTransactions(t2)).length).toBe(antes);
    });
  });
});
