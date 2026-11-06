/**
 * GET /api/content/posts/:postId/registrations/me/payment por HTTP (PEND-07).
 *
 * O que só o banco real prova: a pessoa vem da conta, então outro membro da
 * mesma igreja não lê o pagamento alheio (404, nunca o QR); pendente devolve o
 * payload gravado em `pix_payments`; pago e expirado devolvem o estado sem QR;
 * e a leitura não cria cobrança — a contagem de `pix_payments` não muda e não
 * há trava `ASAAS_PAYMENTS_ENABLED` no caminho.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

const DAY = 24 * 60 * 60 * 1000;
const ts = Date.now();
let app: INestApplication;
let tenantId: string;
let tokenA: string;
let tokenB: string;
let pendingPost: string;
let paidPost: string;
let expiredPost: string;
let freePost: string;

const url = (postId: string) => `/api/content/posts/${postId}/registrations/me/payment`;

beforeAll(async () => {
  const tenant = await admin.tenant.create({ data: { slug: `reg-pay-${ts}`, name: 'Pagamento' } });
  tenantId = tenant.id;
  const cong = await admin.congregation.create({ data: { tenant_id: tenantId, name: 'Sede' } });
  const category = await admin.financialCategory.create({
    data: { tenant_id: tenantId, congregation_id: cong.id, name: 'Inscrições', type: 'income' },
  });

  const mkUser = async (name: string) => {
    const person = await admin.person.create({
      data: { tenant_id: tenantId, congregation_id: cong.id, full_name: name },
    });
    const account = await admin.userAccount.create({
      data: {
        tenant_id: tenantId,
        congregation_id: cong.id,
        person_id: person.id,
        email: `${name.toLowerCase()}-${ts}@reg-pay.test`,
        password_hash: 'x',
        is_active: true,
      },
    });
    return { person, account };
  };
  const a = await mkUser('Ana');
  const b = await mkUser('Beto');

  const mkPost = (title: string, price: number | null) =>
    admin.contentPost.create({
      data: {
        tenant_id: tenantId,
        congregation_id: cong.id,
        type: 'event',
        title,
        is_draft: false,
        published_at: new Date(),
        created_by_user_id: a.account.id,
        event_starts_at: new Date(Date.now() + 5 * DAY),
        registration_enabled: true,
        registration_price: price,
      },
    });

  const mkPix = (status: 'pending' | 'confirmed', ageMs: number) =>
    admin.pixPayment.create({
      data: {
        tenant_id: tenantId,
        congregation_id: cong.id,
        scenario: 'event_registration',
        status,
        amount: 50,
        category_id: category.id,
        qr_code: '00020126-PAYLOAD',
        created_at: new Date(Date.now() - ageMs),
      },
    });

  const mkReg = (
    postId: string,
    pixId: string | null,
    status: 'pending_payment' | 'confirmed',
    paymentStatus: 'pending' | 'paid',
  ) =>
    admin.eventRegistration.create({
      data: {
        tenant_id: tenantId,
        congregation_id: cong.id,
        content_post_id: postId,
        person_id: a.person.id,
        full_name: 'Ana',
        status,
        payment_status: paymentStatus,
        pix_payment_id: pixId,
      },
    });

  pendingPost = (await mkPost('Retiro pendente', 50)).id;
  paidPost = (await mkPost('Retiro pago', 50)).id;
  expiredPost = (await mkPost('Retiro expirado', 50)).id;
  freePost = (await mkPost('Culto gratuito', null)).id;

  await mkReg(pendingPost, (await mkPix('pending', 60_000)).id, 'pending_payment', 'pending');
  await mkReg(paidPost, (await mkPix('confirmed', 60_000)).id, 'confirmed', 'paid');
  await mkReg(expiredPost, (await mkPix('pending', DAY + 60_000)).id, 'pending_payment', 'pending');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  const jwt = app.get(JwtService);
  const base = { tenant_id: tenantId, congregation_id: cong.id, roles: ['member'], plan: 'premium' };
  tokenA = jwt.sign({ ...base, sub: a.account.id });
  tokenB = jwt.sign({ ...base, sub: b.account.id });
}, 120_000);

afterAll(async () => {
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('GET .../registrations/me/payment (PEND-07)', () => {
  it('pendente devolve o QR gravado e a validade, sem criar cobrança', async () => {
    const before = await admin.pixPayment.count({ where: { tenant_id: tenantId } });

    const res = await request(app.getHttpServer())
      .get(url(pendingPost))
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ state: 'pending', qr_code: '00020126-PAYLOAD', amount: 50 });
    expect(new Date(res.body.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(await admin.pixPayment.count({ where: { tenant_id: tenantId } })).toBe(before);
  });

  it('outro membro da mesma igreja não lê o pagamento alheio', async () => {
    const res = await request(app.getHttpServer())
      .get(url(pendingPost))
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('00020126');
  });

  it('pago devolve o estado, sem QR', async () => {
    const res = await request(app.getHttpServer())
      .get(url(paidPost))
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'paid' });
  });

  it('QR além das 24h devolve expirado, sem QR', async () => {
    const res = await request(app.getHttpServer())
      .get(url(expiredPost))
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'expired' });
  });

  it('evento sem preço é 404', async () => {
    const res = await request(app.getHttpServer())
      .get(url(freePost))
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(404);
  });

  it('sem token, 401', async () => {
    const res = await request(app.getHttpServer()).get(url(pendingPost));
    expect(res.status).toBe(401);
  });
});
