/**
 * Doação pública (Cenário 3 do PIX), por HTTP, contra o banco.
 *
 * `teste2-church` é Premium e `teste1-church` é Starter (seed). A Asaas é
 * simulada — nenhum teste automatizado chama a Asaas de verdade — mas a RLS, a
 * leitura do plano e o webhook são os reais. Só tenants de teste
 * (`docs/AMBIENTES.md`); o que o teste cria é apagado no `afterAll`.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend -- public-donation
 */

import { HttpService } from '@nestjs/axios';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { of, throwError } from 'rxjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { MailService } from '../../src/mail/mail.service';
import { StorageService } from '../../src/storage/storage.service';
import { loadTestTenant, TestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL']! } }, log: [] });

const ts = Date.now();
const startedAt = new Date();
const WEBHOOK_TOKEN = `segredo-doacao-${ts}`;

let app: INestApplication;
let premium: TestTenant; // teste2-church
let starter: TestTenant; // teste1-church

// ── Asaas simulada ─────────────────────────────────────────────────────────
const asaas = {
  calls: [] as { method: string; url: string; body?: Record<string, unknown> }[],
  down: false,
  qrDown: false,
  seq: 0,
  reset() {
    this.calls = [];
    this.down = false;
    this.qrDown = false;
  },
};

// ── E-mail e storage simulados (o recibo sai do webhook, fire-and-forget) ──
const outbox = {
  mails: [] as { to: string; name: string; amount: number }[],
  uploads: [] as string[],
  reset() {
    this.mails = [];
    this.uploads = [];
  },
};
const fakeMail = {
  sendDonationReceipt: (to: string, name: string, amount: number) => {
    outbox.mails.push({ to, name, amount });
    return Promise.resolve();
  },
};
const fakeStorage = {
  upload: (_buf: Buffer, key: string) => {
    outbox.uploads.push(key);
    return Promise.resolve(`https://cdn.test/${key}`);
  },
};

const fakeHttp = {
  get: (url: string) => {
    asaas.calls.push({ method: 'GET', url });
    if (asaas.down) return throwError(() => new Error('asaas fora do ar'));
    if (url.includes('/customers')) return of({ data: { data: [{ id: 'cus_int' }] } });
    if (asaas.qrDown) return throwError(() => new Error('qr indisponível'));
    return of({
      data: { encodedImage: 'iVBORw0KGgo=', payload: `000201int${asaas.seq}br.gov.bcb.pix`, expirationDate: '2099-01-01 00:00:00' },
    });
  },
  post: (url: string, body: Record<string, unknown>) => {
    asaas.calls.push({ method: 'POST', url, body });
    if (asaas.down) return throwError(() => new Error('asaas fora do ar'));
    asaas.seq += 1;
    return of({ data: { id: `pay_int_${ts}_${asaas.seq}`, invoiceUrl: 'https://asaas.test/i' } });
  },
  delete: (url: string) => {
    asaas.calls.push({ method: 'DELETE', url });
    return of({ data: {} });
  },
};

const post = (body: Record<string, unknown>) =>
  request(app.getHttpServer()).post('/api/financial/pix/public-donation').send(body);

const status = (slug: string, id: string) =>
  request(app.getHttpServer()).get(`/api/financial/pix/public-donation/${slug}/${id}`);

const webhook = (asaasId: string, value: number) =>
  request(app.getHttpServer())
    .post('/api/financial/pix/webhook')
    .set('asaas-access-token', WEBHOOK_TOKEN)
    .send({ event: 'PAYMENT_CONFIRMED', payment: { id: asaasId, value } });

const txsOf = (tenant: TestTenant) =>
  admin.financialTransaction.findMany({
    where: { tenant_id: tenant.tenantId, source: 'pix_webhook', created_at: { gte: startedAt } },
  });

// A suíte de integração roda num processo só (`--runInBand`): a trava ligada
// aqui não pode vazar para as suítes seguintes.
let paymentsFlagBefore: string | undefined;

beforeAll(async () => {
  process.env['ASAAS_API_KEY'] = 'chave-asaas-teste';
  process.env['ASAAS_API_URL'] = 'https://asaas.test/v3';
  process.env['ASAAS_WEBHOOK_TOKEN'] = WEBHOOK_TOKEN;
  // O QR dinâmico da doação pública está atrás da trava de cobranças Asaas
  // (PROD-28, AD-010); esta suíte prova o caminho com ela ligada. Desligada,
  // Premium cai para a chave estática — coberto em `pix.service.spec.ts`.
  paymentsFlagBefore = process.env['ASAAS_PAYMENTS_ENABLED'];
  process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';

  premium = await loadTestTenant(admin, 'teste2-church');
  starter = await loadTestTenant(admin, 'teste1-church');
  expect(premium.plan).toBe('premium');
  expect(starter.plan).toBe('starter');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(HttpService)
    .useValue(fakeHttp)
    .overrideProvider(MailService)
    .useValue(fakeMail)
    .overrideProvider(StorageService)
    .useValue(fakeStorage)
    .compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api');
  await app.init();
}, 120_000);

afterEach(() => {
  asaas.reset();
  outbox.reset();
});

afterAll(async () => {
  if (paymentsFlagBefore === undefined) delete process.env['ASAAS_PAYMENTS_ENABLED'];
  else process.env['ASAAS_PAYMENTS_ENABLED'] = paymentsFlagBefore;
  const ids = { in: [premium.tenantId, starter.tenantId] };
  await admin.donationReceipt.deleteMany({ where: { tenant_id: ids, created_at: { gte: startedAt } } });
  await admin.financialTransaction.deleteMany({
    where: { tenant_id: ids, source: 'pix_webhook', created_at: { gte: startedAt } },
  });
  await admin.auditLog.deleteMany({
    where: { tenant_id: ids, action: 'pix.confirmed', at: { gte: startedAt } },
  });
  await admin.pixPayment.deleteMany({
    where: { tenant_id: ids, scenario: 'public', created_at: { gte: startedAt } },
  });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('POST /api/financial/pix/public-donation — igreja Premium (teste2-church)', () => {
  it('devolve o QR dinâmico e grava a intenção amarrada à cobrança da Asaas, sem lançamento', async () => {
    const res = await post({ tenant_slug: 'teste2-church', amount: 50 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mode: 'dynamic',
      pix_key: premium.pixKey,
      amount: 50,
      qr_code_image: 'iVBORw0KGgo=',
    });
    expect(res.body.qr_code).toMatch(/^000201int\d+br\.gov\.bcb\.pix$/);
    expect(res.body.transaction_ref).toMatch(/^PIX-[0-9A-F]{8}$/);
    expect(Object.keys(res.body).sort()).toEqual(
      ['amount', 'church_name', 'expires_at', 'mode', 'payment_id', 'pix_key', 'qr_code', 'qr_code_image', 'transaction_ref'],
    );

    const row = await admin.pixPayment.findUniqueOrThrow({ where: { id: res.body.payment_id } });
    expect(row).toMatchObject({
      tenant_id: premium.tenantId,
      congregation_id: premium.congregationId,
      scenario: 'public',
      status: 'pending',
      category_id: premium.ofertaCategoryId,
      qr_code: res.body.qr_code,
    });
    expect(row.asaas_payment_id).toMatch(new RegExp(`^pay_int_${ts}_`));
    expect(res.body.transaction_ref).toBe(`PIX-${row.id.slice(0, 8).toUpperCase()}`);

    const cobranca = asaas.calls.find((c) => c.method === 'POST' && c.url.endsWith('/payments'));
    expect(cobranca?.body).toMatchObject({ billingType: 'PIX', value: 50, externalReference: row.id });

    // Nada de receita antes de a Asaas confirmar.
    expect((await txsOf(premium)).filter((t) => t.created_at >= row.created_at)).toHaveLength(0);
  });

  it('o plano vem do banco: `plan`/`mode` no corpo são rejeitados com 400, e nada é cobrado', async () => {
    const res = await post({ tenant_slug: 'teste1-church', amount: 50, plan: 'premium', mode: 'dynamic' });

    expect(res.status).toBe(400);
    expect(asaas.calls).toEqual([]);
  });

  it('Asaas fora do ar: chave estática com o motivo; a intenção fica gravada', async () => {
    asaas.down = true;

    const res = await post({ tenant_slug: 'teste2-church', amount: 33 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      mode: 'static',
      pix_key: premium.pixKey,
      fallback_reason: 'provider_unavailable',
    });
    expect(res.body).not.toHaveProperty('qr_code');
    const ref = String(res.body.transaction_ref).replace('PIX-', '').toLowerCase();
    const rows = await admin.pixPayment.findMany({
      where: { tenant_id: premium.tenantId, scenario: 'public', id: { startsWith: ref } },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].asaas_payment_id).toBeNull();
  });

  it('cobrança criada mas QR indisponível: a cobrança é cancelada na Asaas e o doador recebe a chave', async () => {
    asaas.qrDown = true;

    const res = await post({ tenant_slug: 'teste2-church', amount: 34 });

    expect(res.body).toMatchObject({ mode: 'static', fallback_reason: 'provider_unavailable' });
    expect(asaas.calls.some((c) => c.method === 'DELETE' && c.url.includes('/payments/pay_int_'))).toBe(true);
  });

  it('teto de cobranças pendentes na última hora: acima dele, chave estática e Asaas intocada', async () => {
    const ids: string[] = [];
    try {
      for (let i = 0; i < 60; i++) {
        const row = await admin.pixPayment.create({
          data: {
            tenant_id: premium.tenantId,
            congregation_id: premium.congregationId,
            scenario: 'public',
            status: 'pending',
            amount: '10.00',
            asaas_payment_id: `teto-${ts}-${i}`,
            category_id: premium.ofertaCategoryId,
          },
        });
        ids.push(row.id);
      }

      const res = await post({ tenant_slug: 'teste2-church', amount: 35 });

      expect(res.body).toMatchObject({ mode: 'static', fallback_reason: 'cap_reached' });
      expect(asaas.calls).toEqual([]);
    } finally {
      await admin.pixPayment.deleteMany({ where: { id: { in: ids } } });
    }
  });
});

describe('POST /api/financial/pix/public-donation — igreja Starter (teste1-church)', () => {
  it('devolve a chave estática, sem fallback e sem tocar na Asaas — contrato anterior preservado', async () => {
    const res = await post({ tenant_slug: 'teste1-church', amount: 25 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      mode: 'static',
      pix_key: starter.pixKey,
      amount: 25,
      church_name: expect.any(String),
      transaction_ref: expect.stringMatching(/^PIX-[0-9A-F]{8}$/),
    });
    expect(asaas.calls).toEqual([]);
  });
});

describe('dados do doador (DPUB-22, DPUB-23)', () => {
  const rowOf = async (res: request.Response) =>
    admin.pixPayment.findFirstOrThrow({
      where: {
        tenant_id: starter.tenantId,
        scenario: 'public',
        id: { startsWith: String(res.body.transaction_ref).replace('PIX-', '').toLowerCase() },
      },
    });

  it('e-mail sem aceite: 400 e nenhuma linha nova', async () => {
    const antes = await admin.pixPayment.count({ where: { tenant_id: starter.tenantId, scenario: 'public' } });

    const res = await post({ tenant_slug: 'teste1-church', amount: 20, donor_email: 'ana@teste.com' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('Aceite o uso do e-mail');
    expect(await admin.pixPayment.count({ where: { tenant_id: starter.tenantId, scenario: 'public' } })).toBe(antes);
  });

  it('com aceite: grava nome, e-mail em minúsculas e o aceite; a resposta não os devolve', async () => {
    const res = await post({
      tenant_slug: 'teste1-church',
      amount: 21,
      donor_name: 'Ana Teste',
      donor_email: 'Ana.Teste@Exemplo.com',
      donor_consent: true,
    });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('Ana');
    expect(JSON.stringify(res.body)).not.toContain('exemplo');
    const row = await rowOf(res);
    expect(row).toMatchObject({
      donor_name: 'Ana Teste',
      donor_email: 'ana.teste@exemplo.com',
      donor_consent_version: 'donor_consent_v1',
    });
    expect(row.donor_consented_at).not.toBeNull();
  });

  it('anônimo: colunas do doador nulas', async () => {
    const res = await post({ tenant_slug: 'teste1-church', amount: 22 });

    expect(await rowOf(res)).toMatchObject({ donor_name: null, donor_email: null, donor_consented_at: null });
  });

  it('o doador não vai para a Asaas (Premium)', async () => {
    await post({
      tenant_slug: 'teste2-church',
      amount: 23,
      donor_name: 'Beltrano Sigiloso',
      donor_email: 'sigiloso@exemplo.com',
      donor_consent: true,
    });

    expect(JSON.stringify(asaas.calls)).not.toContain('Sigiloso');
    expect(JSON.stringify(asaas.calls)).not.toContain('sigiloso@');
  });
});

describe('validação e enumeração (DPUB-11, DPUB-14)', () => {
  it.each([
    ['abaixo do mínimo', 4.99],
    ['acima do máximo', 50_000.01],
    ['10^10, que estourava o banco em 500', 10_000_000_000],
    ['3 casas decimais', 10.123],
    ['zero', 0],
  ])('valor %s: 400, sem linha nova e sem Asaas', async (_nome, amount) => {
    const antes = await admin.pixPayment.count({ where: { tenant_id: premium.tenantId, scenario: 'public' } });

    const res = await post({ tenant_slug: 'teste2-church', amount });

    expect(res.status).toBe(400);
    expect(asaas.calls).toEqual([]);
    expect(await admin.pixPayment.count({ where: { tenant_id: premium.tenantId, scenario: 'public' } })).toBe(antes);
  });

  it('aceita o mínimo e o máximo exatos', async () => {
    expect((await post({ tenant_slug: 'teste1-church', amount: 5 })).status).toBe(200);
    expect((await post({ tenant_slug: 'teste1-church', amount: 50_000 })).status).toBe(200);
  });

  it('slug inexistente e igreja sem chave PIX respondem o mesmo 404 — não revela a configuração', async () => {
    const inexistente = await post({ tenant_slug: `nao-existe-${ts}`, amount: 20 });

    const chaveOriginal = starter.pixKey;
    await admin.brandingConfig.update({ where: { tenant_id: starter.tenantId }, data: { pix_key: null } });
    let semChave;
    try {
      semChave = await post({ tenant_slug: 'teste1-church', amount: 20 });
    } finally {
      await admin.brandingConfig.update({ where: { tenant_id: starter.tenantId }, data: { pix_key: chaveOriginal } });
    }

    expect(inexistente.status).toBe(404);
    expect(semChave.status).toBe(404);
    expect(semChave.body).toEqual(inexistente.body);
  });
});

describe('GET /api/financial/pix/public-donation/:slug/:id — polling e confirmação pelo webhook', () => {
  it('pending → (webhook) → confirmed, com 1 lançamento "Doação pública via PIX" só depois de pago', async () => {
    const criada = await post({ tenant_slug: 'teste2-church', amount: 61 });
    const id: string = criada.body.payment_id;
    const asaasId = (await admin.pixPayment.findUniqueOrThrow({ where: { id } })).asaas_payment_id!;

    const antes = await status('teste2-church', id);
    expect(antes.status).toBe(200);
    expect(antes.body.status).toBe('pending');
    expect(Object.keys(antes.body).sort()).toEqual(['expires_at', 'status']);
    expect(antes.headers['cache-control']).toBe('no-store');
    const txsAntes = (await txsOf(premium)).length;

    await webhook(asaasId, 61).expect(200);

    const depois = await status('teste2-church', id);
    expect(depois.body.status).toBe('confirmed');
    const txs = await txsOf(premium);
    expect(txs.length).toBe(txsAntes + 1);
    expect(txs.some((t) => t.description === 'Doação pública via PIX' && String(t.amount) === '61')).toBe(true);

    // Reentrega do webhook: continua 1 lançamento.
    await webhook(asaasId, 61).expect(200);
    expect((await txsOf(premium)).length).toBe(txsAntes + 1);
  });

  it('o slug de outra igreja com o id desta responde o mesmo 404 de um id inexistente', async () => {
    const criada = await post({ tenant_slug: 'teste2-church', amount: 62 });

    const cruzado = await status('teste1-church', criada.body.payment_id);
    const inexistente = await status('teste1-church', '00000000-0000-4000-8000-000000000000');
    const slugRuim = await status(`nao-existe-${ts}`, criada.body.payment_id);

    expect(cruzado.status).toBe(404);
    expect(cruzado.body).toEqual(inexistente.body);
    expect(slugRuim.status).toBe(404);
    expect(slugRuim.body).toEqual(inexistente.body);
  });

  it('id que não é UUID: 400 — a referência curta PIX-XXXXXXXX nunca é aceita como chave', async () => {
    const res = await status('teste2-church', 'PIX-ABCDEF12');

    expect(res.status).toBe(400);
  });

  it('cobrança pendente com mais de 24h aparece como `expired`, sem ser gravada', async () => {
    const row = await admin.pixPayment.create({
      data: {
        tenant_id: premium.tenantId,
        congregation_id: premium.congregationId,
        scenario: 'public',
        status: 'pending',
        amount: '15.00',
        asaas_payment_id: `velha-${ts}`,
        category_id: premium.ofertaCategoryId,
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000),
      },
    });

    const res = await status('teste2-church', row.id);

    expect(res.body.status).toBe('expired');
    expect((await admin.pixPayment.findUniqueOrThrow({ where: { id: row.id } })).status).toBe('pending');
    await admin.pixPayment.delete({ where: { id: row.id } });
  });
});

describe('limite de requisições (DPUB-12) — por igreja + origem', () => {
  it('estoura o limite de uma igreja com 429, e outra igreja, na mesma origem, segue livre', async () => {
    let primeiro429 = -1;
    for (let i = 0; i < 40 && primeiro429 === -1; i++) {
      const res = await post({ tenant_slug: 'teste1-church', amount: 5 });
      if (res.status === 429) primeiro429 = i;
    }

    expect(primeiro429).toBeGreaterThan(0);
    // O teste1 já gastou parte dos 30/min nos casos acima; o limite é 30.
    expect(primeiro429).toBeLessThanOrEqual(30);

    const outraIgreja = await post({ tenant_slug: 'teste2-church', amount: 5 });
    expect(outraIgreja.status).toBe(200);
  });
});

describe('recibo da doação pública identificada (DPUB-25, opção b)', () => {
  const receiptsOf = (tenant: TestTenant) =>
    admin.donationReceipt.findMany({ where: { tenant_id: tenant.tenantId, created_at: { gte: startedAt } } });

  /** O recibo sai do webhook em segundo plano: espera aparecer, com teto. */
  async function waitForReceipt(tenant: TestTenant, email: string) {
    for (let i = 0; i < 50; i++) {
      const found = (await receiptsOf(tenant)).find((r) => r.recipient_email === email);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 100));
    }
    return undefined;
  }

  const settle = () => new Promise((r) => setTimeout(r, 600));

  async function donateAndPay(slug: string, extra: Record<string, unknown>) {
    const res = await post({ tenant_slug: slug, amount: 90, ...extra });
    const row = await admin.pixPayment.findUniqueOrThrow({ where: { id: res.body.payment_id } });
    await webhook(row.asaas_payment_id!, 90).expect(200);
    return row;
  }

  it('Premium: doador com e-mail e aceite recebe o recibo no e-mail declarado, sem Person', async () => {
    await donateAndPay('teste2-church', {
      donor_name: 'Ana Recibo',
      donor_email: 'ana.recibo@exemplo.com',
      donor_consent: true,
    });

    const receipt = await waitForReceipt(premium, 'ana.recibo@exemplo.com');

    expect(receipt).toMatchObject({
      tenant_id: premium.tenantId,
      person_id: null,
      recipient_name: 'Ana Recibo',
      recipient_email: 'ana.recibo@exemplo.com',
    });
    expect(receipt?.receipt_url).toMatch(/^https:\/\/cdn\.test\/donation-receipts\//);
    expect(outbox.mails).toEqual([{ to: 'ana.recibo@exemplo.com', name: 'Ana Recibo', amount: 90 }]);
  });

  it('Premium: doação anônima confirmada não gera recibo', async () => {
    const antes = (await receiptsOf(premium)).length;

    await donateAndPay('teste2-church', {});
    await settle();

    expect((await receiptsOf(premium)).length).toBe(antes);
    expect(outbox.mails).toEqual([]);
  });

  it('Premium: só o nome, sem e-mail, também não gera recibo', async () => {
    const antes = (await receiptsOf(premium)).length;

    await donateAndPay('teste2-church', { donor_name: 'Só Nome' });
    await settle();

    expect((await receiptsOf(premium)).length).toBe(antes);
  });

  it('Starter: recibo é recurso Premium — nem com e-mail e aceite gravados', async () => {
    // Doação estática do Starter não tem cobrança na Asaas; simula-se uma linha
    // com id de cobrança só para provar que o plano, lido do banco, barra o recibo.
    const asaasId = `starter-recibo-${ts}`;
    await admin.pixPayment.create({
      data: {
        tenant_id: starter.tenantId,
        congregation_id: starter.congregationId,
        scenario: 'public',
        status: 'pending',
        amount: '40.00',
        asaas_payment_id: asaasId,
        category_id: starter.ofertaCategoryId,
        donor_name: 'Starter Doador',
        donor_email: 'starter.doador@exemplo.com',
        donor_consent_version: 'donor_consent_v1',
        donor_consented_at: new Date(),
      },
    });

    await webhook(asaasId, 40).expect(200);
    await settle();

    expect(await receiptsOf(starter)).toHaveLength(0);
    expect(outbox.mails).toEqual([]);
    // O lançamento, esse sim, foi criado: o recibo é que é Premium.
    expect((await txsOf(starter)).length).toBeGreaterThan(0);
  });
});
