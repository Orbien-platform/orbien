/**
 * GET /api/content/my-registrations por HTTP (PROD-30, Início do app).
 *
 * O que só o banco real prova: o recorte é pela pessoa do token (outro membro
 * da mesma igreja não vê a inscrição alheia), evento passado e inscrição
 * cancelada ficam de fora, e a rota literal não cai em `:postId`.
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

beforeAll(async () => {
  const tenant = await admin.tenant.create({ data: { slug: `my-regs-${ts}`, name: 'Inscrições' } });
  tenantId = tenant.id;
  const cong = await admin.congregation.create({ data: { tenant_id: tenantId, name: 'Sede' } });

  const mkUser = async (name: string) => {
    const person = await admin.person.create({
      data: { tenant_id: tenantId, congregation_id: cong.id, full_name: name },
    });
    const account = await admin.userAccount.create({
      data: {
        tenant_id: tenantId,
        congregation_id: cong.id,
        person_id: person.id,
        email: `${name.toLowerCase()}-${ts}@my-regs.test`,
        password_hash: 'x',
        is_active: true,
      },
    });
    return { person, account };
  };
  const a = await mkUser('Ana');
  const b = await mkUser('Beto');

  const mkPost = (title: string, startsAt: Date) =>
    admin.contentPost.create({
      data: {
        tenant_id: tenantId,
        congregation_id: cong.id,
        type: 'event',
        title,
        is_draft: false,
        published_at: new Date(),
        created_by_user_id: a.account.id,
        event_starts_at: startsAt,
        event_location: 'Templo',
        registration_enabled: true,
      },
    });
  const soon = await mkPost('Conferência', new Date(Date.now() + 5 * DAY));
  const later = await mkPost('Retiro', new Date(Date.now() + 20 * DAY));
  const past = await mkPost('Culto passado', new Date(Date.now() - 5 * DAY));
  const cancelled = await mkPost('Desistiu', new Date(Date.now() + 8 * DAY));

  const reg = (postId: string, status: 'confirmed' | 'cancelled') =>
    admin.eventRegistration.create({
      data: {
        tenant_id: tenantId,
        congregation_id: cong.id,
        content_post_id: postId,
        person_id: a.person.id,
        full_name: 'Ana',
        status,
      },
    });
  await reg(later.id, 'confirmed');
  await reg(soon.id, 'confirmed');
  await reg(past.id, 'confirmed');
  await reg(cancelled.id, 'cancelled');

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  const jwt = app.get(JwtService);
  const base = { tenant_id: tenantId, congregation_id: cong.id, roles: ['member'], plan: 'starter' };
  tokenA = jwt.sign({ ...base, sub: a.account.id });
  tokenB = jwt.sign({ ...base, sub: b.account.id });
}, 120_000);

afterAll(async () => {
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('GET /content/my-registrations (PROD-30)', () => {
  it('devolve as próximas inscrições da pessoa, do evento mais próximo ao mais distante', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/content/my-registrations')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.map((r: { title: string }) => r.title)).toEqual(['Conferência', 'Retiro']);
    expect(res.body[0]).toMatchObject({ status: 'confirmed', event_location: 'Templo' });
  });

  it('outro membro da mesma igreja não vê a inscrição alheia', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/content/my-registrations')
      .set('Authorization', `Bearer ${tokenB}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('sem token, 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/content/my-registrations');
    expect(res.status).toBe(401);
  });
});
