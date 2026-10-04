/**
 * Tesouraria: intenções da doação pública (PEND-14) — lista e baixa manual, por
 * HTTP, autenticado, contra o banco. A RLS e a leitura do plano são as reais.
 *
 * O Starter (`teste1-church`) é quem mais usa isto: a chave estática só se
 * confirma quando o tesoureiro vê o PIX no extrato. `teste2-church` (Premium)
 * prova o isolamento entre igrejas e o recibo da baixa. Só tenants de teste
 * (`docs/AMBIENTES.md`); o que o teste cria é apagado no `afterAll`.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend -- public-intents
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/mail/mail.service';
import { StorageService } from '../../src/storage/storage.service';
import { loadTestTenant, TestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });

const ts = Date.now();
const startedAt = new Date();

const outbox = { mails: [] as { to: string; name: string }[] };
const fakeMail = {
  sendDonationReceipt: (to: string, name: string) => {
    outbox.mails.push({ to, name });
    return Promise.resolve();
  },
};
const fakeStorage = {
  upload: (_b: Buffer, key: string) => Promise.resolve(`https://cdn.test/${key}`),
};

let app: INestApplication;
let starter: TestTenant; // teste1-church
let premium: TestTenant; // teste2-church
let starterToken: string;
let premiumToken: string;
let memberToken: string;
let starterUserId: string;
let extraCongregationId: string;
let extraCategoryId: string;

const get = (path: string, token?: string) => {
  const req = request(app.getHttpServer()).get(`/api/financial/pix/${path}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const settle = (id: string, token?: string) => {
  const req = request(app.getHttpServer()).post(`/api/financial/pix/public-intents/${id}/settle`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

async function intent(
  tenant: TestTenant,
  tag: string,
  extra: Record<string, unknown> = {},
  congregationId = tenant.congregationId,
  categoryId = tenant.ofertaCategoryId,
) {
  return admin.pixPayment.create({
    data: {
      tenant_id: tenant.tenantId,
      congregation_id: congregationId,
      scenario: 'public',
      status: 'pending',
      amount: '30.00',
      pix_key: `chave-${tag}`,
      category_id: categoryId,
      ...extra,
    },
  });
}

const manualTxs = (tenant: TestTenant) =>
  admin.financialTransaction.findMany({
    where: { tenant_id: tenant.tenantId, source: 'manual', description: 'Doação pública via PIX (baixa manual)', created_at: { gte: startedAt } },
  });

beforeAll(async () => {
  starter = await loadTestTenant(admin, 'teste1-church');
  premium = await loadTestTenant(admin, 'teste2-church');
  starterUserId = (await admin.userAccount.findFirstOrThrow({ where: { tenant_id: starter.tenantId }, select: { id: true } })).id;
  const premiumUserId = (await admin.userAccount.findFirstOrThrow({ where: { tenant_id: premium.tenantId }, select: { id: true } })).id;

  extraCongregationId = (
    await admin.congregation.create({ data: { tenant_id: starter.tenantId, name: `Intenções ${ts}` } })
  ).id;
  extraCategoryId = (
    await admin.financialCategory.create({
      data: { tenant_id: starter.tenantId, congregation_id: extraCongregationId, name: 'Oferta', type: 'income' },
    })
  ).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(fakeMail)
    .overrideProvider(StorageService)
    .useValue(fakeStorage)
    .compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();

  const jwt = app.get(JwtService);
  const sign = (t: TestTenant, sub: string, roles: string[]) =>
    jwt.sign({ sub, tenant_id: t.tenantId, congregation_id: t.congregationId, roles, plan: t.plan });
  starterToken = sign(starter, starterUserId, ['treasurer']);
  premiumToken = sign(premium, premiumUserId, ['treasurer']);
  memberToken = sign(starter, starterUserId, ['member']);
}, 120_000);

afterEach(() => {
  outbox.mails = [];
});

afterAll(async () => {
  const tenants = { in: [starter.tenantId, premium.tenantId] };
  await admin.donationReceipt.deleteMany({ where: { tenant_id: tenants, created_at: { gte: startedAt } } });
  await admin.financialTransaction.deleteMany({
    where: { tenant_id: tenants, source: 'manual', description: 'Doação pública via PIX (baixa manual)', created_at: { gte: startedAt } },
  });
  await admin.auditLog.deleteMany({
    where: { tenant_id: tenants, action: 'pix.settled_manually', at: { gte: startedAt } },
  });
  await admin.pixPayment.deleteMany({ where: { tenant_id: tenants, scenario: 'public', created_at: { gte: startedAt } } });
  await admin.financialCategory.deleteMany({ where: { id: extraCategoryId } });
  await admin.congregation.deleteMany({ where: { id: extraCongregationId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('GET /api/financial/pix/public-intents', () => {
  it('sem token: 401; papel sem acesso ao financeiro: 403', async () => {
    expect((await get('public-intents')).status).toBe(401);
    expect((await get('public-intents', memberToken)).status).toBe(403);
  });

  it('lista as intenções da congregação, com modo e estado, no Starter (sem exigir Premium)', async () => {
    const estatica = await intent(starter, 'lista-estatica', { donor_name: 'Ana', donor_email: 'ana@exemplo.com' });
    const dinamica = await intent(starter, 'lista-dinamica', { asaas_payment_id: `int-din-${ts}` });
    const falhou = await intent(starter, 'lista-falhou', { status: 'failed' });

    const res = await get('public-intents?page_size=100', starterToken);

    expect(res.status).toBe(200);
    const byId = new Map<string, Record<string, unknown>>(res.body.data.map((r: { id: string }) => [r.id, r]));
    expect(byId.get(estatica.id)).toMatchObject({
      reference: `PIX-${estatica.id.slice(0, 8).toUpperCase()}`,
      amount: '30',
      status: 'pending',
      mode: 'static',
      donor_name: 'Ana',
      donor_email: 'ana@exemplo.com',
      category_name: 'Oferta',
    });
    expect(byId.get(dinamica.id)).toMatchObject({ mode: 'dynamic', status: 'pending' });
    expect(byId.get(falhou.id)).toMatchObject({ status: 'failed' });
  });

  it('não mostra intenção de outra igreja nem de outra congregação do mesmo tenant', async () => {
    const outraIgreja = await intent(premium, 'isolamento-outra-igreja');
    const outraCongregacao = await intent(starter, 'isolamento-outra-cong', {}, extraCongregationId, extraCategoryId);

    const res = await get('public-intents?page_size=100', starterToken);

    const ids = res.body.data.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(outraIgreja.id);
    expect(ids).not.toContain(outraCongregacao.id);
  });

  it('filtra por estado', async () => {
    const res = await get('public-intents?status=failed&page_size=100', starterToken);

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r: { status: string }) => r.status === 'failed')).toBe(true);
  });

  it('pagina, com total', async () => {
    const res = await get('public-intents?page=1&page_size=2', starterToken);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBeGreaterThanOrEqual(3);
  });

  it('as mais novas primeiro', async () => {
    const res = await get('public-intents?page_size=100', starterToken);

    const datas: number[] = res.body.data.map((r: { created_at: string }) => new Date(r.created_at).getTime());
    expect(datas).toEqual([...datas].sort((a, b) => b - a));
  });

  it('estado inválido: 400', async () => {
    expect((await get('public-intents?status=paid', starterToken)).status).toBe(400);
  });
});

describe('POST /api/financial/pix/public-intents/:id/settle', () => {
  it('sem token: 401; papel sem acesso: 403', async () => {
    const row = await intent(starter, 'settle-auth');

    expect((await settle(row.id)).status).toBe(401);
    expect((await settle(row.id, memberToken)).status).toBe(403);
    expect((await admin.pixPayment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('pending');
  });

  it('baixa a chave estática: confirma a intenção e cria 1 lançamento manual na categoria, em nome do tesoureiro', async () => {
    const row = await intent(starter, 'settle-ok', { amount: '77.50' });
    const antes = (await manualTxs(starter)).length;

    const res = await settle(row.id, starterToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: row.id, status: 'confirmed' });
    const atual = await admin.pixPayment.findUniqueOrThrow({ where: { id: row.id } });
    expect(atual.status).toBe('confirmed');
    expect(atual.paid_at).not.toBeNull();
    const txs = await manualTxs(starter);
    expect(txs.length).toBe(antes + 1);
    expect(txs.find((t) => String(t.amount) === '77.5')).toMatchObject({
      type: 'income',
      source: 'manual',
      category_id: starter.ofertaCategoryId,
      congregation_id: starter.congregationId,
      created_by_user_id: starterUserId,
    });
  });

  it('é idempotente: a segunda baixa e baixas simultâneas não duplicam o lançamento', async () => {
    const row = await intent(starter, 'settle-idem', { amount: '88.00' });
    const antes = (await manualTxs(starter)).length;

    const respostas = await Promise.all([
      settle(row.id, starterToken),
      settle(row.id, starterToken),
      settle(row.id, starterToken),
    ]);
    await settle(row.id, starterToken);

    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200]);
    expect((await manualTxs(starter)).length).toBe(antes + 1);
  });

  it('intenção `failed` também aceita a baixa', async () => {
    const row = await intent(starter, 'settle-failed', { status: 'failed', amount: '66.00' });

    expect((await settle(row.id, starterToken)).status).toBe(200);
    expect((await admin.pixPayment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('confirmed');
  });

  it('QR dinâmico não dá baixa manual: 409, nada muda, nenhum lançamento', async () => {
    const row = await intent(starter, 'settle-dinamica', { asaas_payment_id: `int-din2-${ts}`, amount: '55.00' });
    const antes = (await manualTxs(starter)).length;

    const res = await settle(row.id, starterToken);

    expect(res.status).toBe(409);
    expect((await admin.pixPayment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('pending');
    expect((await manualTxs(starter)).length).toBe(antes);
  });

  it('id inexistente e intenção de OUTRA igreja respondem o mesmo 404; id que não é UUID, 400', async () => {
    const alheia = await intent(premium, 'settle-alheia');

    const inexistente = await settle('00000000-0000-4000-8000-000000000000', starterToken);
    const cruzada = await settle(alheia.id, starterToken);

    expect(inexistente.status).toBe(404);
    expect(cruzada.status).toBe(404);
    expect(cruzada.body).toEqual(inexistente.body);
    expect((await admin.pixPayment.findUniqueOrThrow({ where: { id: alheia.id } })).status).toBe('pending');
    expect((await settle('nao-e-uuid', starterToken)).status).toBe(400);
  });

  it('intenção de outra congregação do mesmo tenant também é 404', async () => {
    const outra = await intent(starter, 'settle-outra-cong', {}, extraCongregationId, extraCategoryId);

    expect((await settle(outra.id, starterToken)).status).toBe(404);
  });

  it('deixa rastro de auditoria da baixa', async () => {
    const row = await intent(starter, 'settle-audit', { amount: '44.00' });

    await settle(row.id, starterToken).expect(200);

    const logs = await admin.auditLog.findMany({
      where: { tenant_id: starter.tenantId, action: 'pix.settled_manually', at: { gte: startedAt } },
    });
    expect(logs.some((l) => JSON.stringify(l.after).includes(row.id) && l.actor_user_id === starterUserId)).toBe(true);
  });

  it('Premium: a baixa de intenção com e-mail e aceite emite o recibo para o e-mail declarado', async () => {
    const row = await intent(premium, 'settle-recibo', {
      amount: '120.00',
      donor_name: 'Beltrana Recibo',
      donor_email: 'beltrana.recibo@exemplo.com',
      donor_consent_version: 'donor_consent_v1',
      donor_consented_at: new Date(),
    });

    await settle(row.id, premiumToken).expect(200);

    const receipt = await admin.donationReceipt.findFirst({
      where: { tenant_id: premium.tenantId, recipient_email: 'beltrana.recibo@exemplo.com' },
    });
    expect(receipt).toMatchObject({ person_id: null, recipient_name: 'Beltrana Recibo' });
    expect(outbox.mails).toEqual([{ to: 'beltrana.recibo@exemplo.com', name: 'Beltrana Recibo' }]);
  });

  it('Starter: a baixa funciona, mas recibo é Premium — nada é emitido', async () => {
    const row = await intent(starter, 'settle-sem-recibo', {
      amount: '99.00',
      donor_email: 'starter.sem.recibo@exemplo.com',
      donor_consent_version: 'donor_consent_v1',
      donor_consented_at: new Date(),
    });

    await settle(row.id, starterToken).expect(200);

    expect(await admin.donationReceipt.count({ where: { tenant_id: starter.tenantId, created_at: { gte: startedAt } } })).toBe(0);
    expect(outbox.mails).toEqual([]);
  });
});
