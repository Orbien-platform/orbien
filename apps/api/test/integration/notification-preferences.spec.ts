/**
 * GET/PATCH /api/me/notification-preferences por HTTP (MOB-10a).
 *
 * Cobre AC1 (default 4x ligado), AC2 (PATCH persiste e reflete na UI — aqui,
 * no GET seguinte) e AC4 (mesma conta lida de novo continua com o estado
 * salvo) da história "Escolher categorias de notificação"
 * (spec.md). A rota não aceita id — é sempre "a própria conta" — então o
 * teste de isolamento entre contas prova isso pedindo como a conta B e
 * confirmando que ela nunca vê o que a conta A gravou.
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

let app: INestApplication;
let tokenA: string;
let tokenB: string;
const ts = Date.now();
let tenantId: string;
let congregationId: string;

beforeAll(async () => {
  const tenant = await admin.tenant.create({ data: { slug: `notif-pref-${ts}`, name: 'NP' } });
  tenantId = tenant.id;
  const cong = await admin.congregation.create({
    data: { tenant_id: tenantId, name: 'Sede' },
  });
  congregationId = cong.id;

  const acctA = await admin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      email: `conta-a-${ts}@np.test`,
      password_hash: 'x',
      is_active: true,
    },
  });
  const acctB = await admin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      email: `conta-b-${ts}@np.test`,
      password_hash: 'x',
      is_active: true,
    },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  const jwt = app.get(JwtService);
  tokenA = jwt.sign({
    sub: acctA.id,
    email: acctA.email,
    tenant_id: tenantId,
    congregation_id: congregationId,
    roles: ['member'],
  });
  tokenB = jwt.sign({
    sub: acctB.id,
    email: acctB.email,
    tenant_id: tenantId,
    congregation_id: congregationId,
    roles: ['member'],
  });
}, 120_000);

afterAll(async () => {
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

it('GET sem preferência salva devolve as 4 categorias ligadas (AC1)', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/me/notification-preferences')
    .set('Authorization', `Bearer ${tokenA}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ avisos: true, oracao: true, eventos: true, devocional: true });
});

it('PATCH persiste a mudança e o GET seguinte reflete (AC2, AC4)', async () => {
  const patchRes = await request(app.getHttpServer())
    .patch('/api/me/notification-preferences')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ oracao: false });

  expect(patchRes.status).toBe(200);
  expect(patchRes.body).toEqual({
    avisos: true,
    oracao: false,
    eventos: true,
    devocional: true,
  });

  const getRes = await request(app.getHttpServer())
    .get('/api/me/notification-preferences')
    .set('Authorization', `Bearer ${tokenA}`);

  expect(getRes.status).toBe(200);
  expect(getRes.body).toEqual({
    avisos: true,
    oracao: false,
    eventos: true,
    devocional: true,
  });
});

it('conta B nunca lê a preferência da conta A — a rota é sempre "a própria conta"', async () => {
  // Conta A já desligou "oracao" no teste anterior. Se a rota vazasse por
  // tenant/congregação em vez de por user_account_id, a conta B veria
  // oracao:false aqui — em vez disso, B nunca gravou nada e deve ver o
  // default (4x ligado), prova de que GET nunca aceita nem infere outro id.
  const res = await request(app.getHttpServer())
    .get('/api/me/notification-preferences')
    .set('Authorization', `Bearer ${tokenB}`);

  expect(res.status).toBe(200);
  expect(res.body).toEqual({ avisos: true, oracao: true, eventos: true, devocional: true });
});

it('PATCH da conta B não altera a preferência da conta A', async () => {
  const patchRes = await request(app.getHttpServer())
    .patch('/api/me/notification-preferences')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ eventos: false });

  expect(patchRes.status).toBe(200);
  expect(patchRes.body).toEqual({
    avisos: true,
    oracao: true,
    eventos: false,
    devocional: true,
  });

  const getAResAfter = await request(app.getHttpServer())
    .get('/api/me/notification-preferences')
    .set('Authorization', `Bearer ${tokenA}`);

  expect(getAResAfter.body).toEqual({
    avisos: true,
    oracao: false,
    eventos: true,
    devocional: true,
  });
});
