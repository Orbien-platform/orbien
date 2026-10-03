/**
 * `/api/me/pix-subscriptions` por HTTP, contra o Postgres de verdade (PROD-28).
 *
 * O teste de unidade prova que o serviço filtra pela pessoa; este prova que,
 * com o RLS ativo (a rota roda como `app_user` pelo `TenantContextInterceptor`),
 * um membro não lê nem cancela a assinatura de outro membro **da mesma
 * congregação** — o caso que a policy 023 (tenant + congregação) sozinha
 * deixaria passar. Prova também a unique parcial "uma ativa por doador" e a
 * trava `ASAAS_PAYMENTS_ENABLED`.
 *
 * A Asaas é um fake (`overrideProvider(HttpService)`): nenhuma chamada de rede.
 * Tenant efêmero `me-pixsub-*`, criado e apagado aqui, no banco local — nunca
 * um tenant de cliente.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { HttpService } from '@nestjs/axios';
import { PrismaClient } from '@prisma/client';
import { of } from 'rxjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

const ts = Date.now();
let app: INestApplication;
let tenantId: string;
let congregationId: string;
let mariaPersonId: string;
let joaoPersonId: string;
let tokenMaria: string;
let tokenJoao: string;
let tokenSemPessoa: string;
let joaoSubscriptionId: string;
const asaasDeletes: string[] = [];
let asaasSubscriptionSeq = 0;

const fakeHttp = {
  get: (url: string) => of({ data: url.includes('/customers') ? { data: [{ id: 'cus_fake' }] } : {} }),
  post: (url: string) =>
    of({
      data: url.includes('/subscriptions')
        ? { id: `sub_fake_${ts}_${++asaasSubscriptionSeq}` }
        : { id: 'cus_fake' },
    }),
  delete: (url: string) => {
    asaasDeletes.push(url);
    return of({ data: {} });
  },
};

const envOriginal = { ...process.env };

beforeAll(async () => {
  process.env['ASAAS_API_KEY'] = 'chave-fake';
  process.env['ASAAS_API_URL'] = 'https://asaas.fake/v3';

  const tenant = await admin.tenant.create({ data: { slug: `me-pixsub-${ts}`, name: 'Me PixSub' } });
  tenantId = tenant.id;
  await admin.tenantPlan.create({ data: { tenant_id: tenantId, plan: 'premium', status: 'active' } });
  await admin.brandingConfig.create({ data: { tenant_id: tenantId, pix_key: 'chave@igreja.fake' } });
  congregationId = (
    await admin.congregation.create({ data: { tenant_id: tenantId, name: 'Sede' } })
  ).id;
  const category = await admin.financialCategory.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Ofertas', type: 'income' },
  });

  mariaPersonId = (
    await admin.person.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Maria' },
    })
  ).id;
  joaoPersonId = (
    await admin.person.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'João' },
    })
  ).id;

  const conta = (email: string, personId: string | null) =>
    admin.userAccount.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        person_id: personId,
        email,
        password_hash: 'x',
        is_active: true,
      },
    });
  const maria = await conta(`maria-${ts}@pixsub.fake`, mariaPersonId);
  const joao = await conta(`joao-${ts}@pixsub.fake`, joaoPersonId);
  const semPessoa = await conta(`sem-pessoa-${ts}@pixsub.fake`, null);

  // A assinatura do João já existe (como se o tesoureiro a tivesse criado).
  joaoSubscriptionId = (
    await admin.pixSubscription.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        donor_person_id: joaoPersonId,
        category_id: category.id,
        amount: 80,
        asaas_subscription_id: `sub_joao_${ts}`,
        status: 'active',
        created_by_user_id: joao.id,
      },
    })
  ).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(HttpService)
    .useValue(fakeHttp)
    .compile();
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
      tenant_id: tenantId,
      congregation_id: congregationId,
      roles: ['member'],
      plan: 'premium',
    });
  tokenMaria = sign(maria.id, maria.email);
  tokenJoao = sign(joao.id, joao.email);
  tokenSemPessoa = sign(semPessoa.id, semPessoa.email);
}, 120_000);

afterAll(async () => {
  process.env = { ...envOriginal };
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

const body = { amount: 120, consent_version: 'dizimo-automatico-v1' };

describe('trava ASAAS_PAYMENTS_ENABLED desligada', () => {
  beforeAll(() => {
    delete process.env['ASAAS_PAYMENTS_ENABLED'];
  });

  it('POST responde 503 e nada é gravado', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/me/pix-subscriptions')
      .set('Authorization', `Bearer ${tokenMaria}`)
      .send(body);

    expect(res.status).toBe(503);
    expect(
      await admin.pixSubscription.count({ where: { donor_person_id: mariaPersonId } }),
    ).toBe(0);
  });

  it('GET continua funcionando — quem já assinou vê a assinatura (o cancelamento, abaixo)', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/me/pix-subscriptions')
      .set('Authorization', `Bearer ${tokenJoao}`);
    expect(list.status).toBe(200);
    expect(list.body.map((s: { id: string }) => s.id)).toEqual([joaoSubscriptionId]);
  });

  it('GET /me/permissions avisa os fronts que a trava está desligada', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/me/permissions')
      .set('Authorization', `Bearer ${tokenMaria}`);
    expect(res.body.features).toEqual({ asaas_payments: false });
  });
});

describe('trava ligada', () => {
  beforeAll(() => {
    process.env['ASAAS_PAYMENTS_ENABLED'] = 'true';
  });

  it('corpo com donor_person_id é 400 — o doador nunca escolhe a pessoa', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/me/pix-subscriptions')
      .set('Authorization', `Bearer ${tokenMaria}`)
      .send({ ...body, donor_person_id: joaoPersonId });

    expect(res.status).toBe(400);
  });

  it('cria a assinatura para a pessoa da conta, com o aceite', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/me/pix-subscriptions')
      .set('Authorization', `Bearer ${tokenMaria}`)
      .send(body);

    expect(res.status).toBe(201);
    const row = await admin.pixSubscription.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({
      donor_person_id: mariaPersonId,
      status: 'active',
      consent_version: 'dizimo-automatico-v1',
    });
    expect(row.consent_accepted_at).toBeInstanceOf(Date);
  });

  it('segunda contratação com uma ativa é 409, sem segunda assinatura', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/me/pix-subscriptions')
      .set('Authorization', `Bearer ${tokenMaria}`)
      .send(body);

    expect(res.status).toBe(409);
    expect(
      await admin.pixSubscription.count({
        where: { donor_person_id: mariaPersonId, status: 'active' },
      }),
    ).toBe(1);
  });

  it('a unique parcial do banco barra uma segunda ativa mesmo por fora do serviço', async () => {
    const existente = await admin.pixSubscription.findFirstOrThrow({
      where: { donor_person_id: mariaPersonId, status: 'active' },
    });
    const { id: _id, asaas_subscription_id: _a, created_at: _c, updated_at: _u, ...resto } =
      existente;

    await expect(
      admin.pixSubscription.create({
        data: { ...resto, asaas_subscription_id: `sub_dup_${ts}` },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('conta sem pessoa ligada: POST 409, GET lista vazia', async () => {
    const post = await request(app.getHttpServer())
      .post('/api/me/pix-subscriptions')
      .set('Authorization', `Bearer ${tokenSemPessoa}`)
      .send(body);
    expect(post.status).toBe(409);

    const get = await request(app.getHttpServer())
      .get('/api/me/pix-subscriptions')
      .set('Authorization', `Bearer ${tokenSemPessoa}`);
    expect(get.status).toBe(200);
    expect(get.body).toEqual([]);
  });
});

describe('isolamento entre membros da MESMA congregação', () => {
  it('Maria lista só a dela — não vê a do João', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/me/pix-subscriptions')
      .set('Authorization', `Bearer ${tokenMaria}`);

    expect(res.status).toBe(200);
    expect(res.body.map((s: { id: string }) => s.id)).not.toContain(joaoSubscriptionId);
    expect(res.body).toHaveLength(1);
  });

  it('Maria não cancela a do João: 404, sem chamar a Asaas, e a do João segue ativa', async () => {
    const deletesAntes = asaasDeletes.length;

    const res = await request(app.getHttpServer())
      .patch(`/api/me/pix-subscriptions/${joaoSubscriptionId}/cancel`)
      .set('Authorization', `Bearer ${tokenMaria}`);

    expect(res.status).toBe(404);
    expect(asaasDeletes.length).toBe(deletesAntes);
    const joao = await admin.pixSubscription.findUniqueOrThrow({ where: { id: joaoSubscriptionId } });
    expect(joao.status).toBe('active');
  });

  it('João cancela a dele — com a trava desligada — e a Asaas é chamada antes', async () => {
    delete process.env['ASAAS_PAYMENTS_ENABLED'];

    const res = await request(app.getHttpServer())
      .patch(`/api/me/pix-subscriptions/${joaoSubscriptionId}/cancel`)
      .set('Authorization', `Bearer ${tokenJoao}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: joaoSubscriptionId, status: 'cancelled' });
    expect(asaasDeletes).toContain(`https://asaas.fake/v3/subscriptions/sub_joao_${ts}`);
  });
});
