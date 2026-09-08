/**
 * GET /api/songs por HTTP — o catálogo que o menu Repertório abre.
 *
 * Existe por causa de um 500 relatado nessa tela: o `last_played_at` atravessa
 * quatro relações (setlist_songs → setlists → service_order_items →
 * service_orders → celebration_instances), todas com RLS própria, e nenhum
 * teste exercia esse caminho contra banco de verdade — a suíte de unidade
 * mocka o Prisma, então mediria o mock.
 *
 * Os dois últimos casos reproduzem a causa real daquele 500: banco atrás do
 * código (migration não aplicada). Antes do
 * `SchemaDriftExceptionFilter` a resposta era 500
 * `{"message":"Internal server error"}`, string que o front exibia como está.
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
let token: string;
const ts = Date.now();
let tenantId: string;
let congregationId: string;

beforeAll(async () => {
  const tenant = await admin.tenant.create({ data: { slug: `rep-${ts}`, name: 'Rep' } });
  tenantId = tenant.id;
  const cong = await admin.congregation.create({
    data: { tenant_id: tenantId, name: 'Sede' },
  });
  congregationId = cong.id;

  await admin.$executeRaw`INSERT INTO roles (code, name) VALUES ('tenant_admin','Tenant Admin') ON CONFLICT (code) DO NOTHING`;

  const person = await admin.person.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Admin Rep' },
  });
  const acct = await admin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      person_id: person.id,
      email: `admin-${ts}@rep.test`,
      password_hash: 'x',
      is_active: true,
    },
  });
  await admin.roleAssignment.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      user_account_id: acct.id,
      role_code: 'tenant_admin',
    },
  });

  // catálogo: uma música nunca tocada e uma usada numa setlist
  const nunca = await admin.song.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, title: 'Nunca Tocada' },
  });
  const tocada = await admin.song.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, title: 'Já Tocada', key: 'G' },
  });
  void nunca;

  const celeb = await admin.celebration.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name: 'Culto',
      type: 'sunday_service',
      start_time: '19:00',
      recurrence: 'weekly',
      day_of_week: 0,
    },
  });
  const inst = await admin.celebrationInstance.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      celebration_id: celeb.id,
      scheduled_date: new Date('2026-09-01T19:00:00Z'),
    },
  });
  const so = await admin.serviceOrder.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      celebration_instance_id: inst.id,
      title: 'Ordem',
    },
  });
  const item = await admin.serviceOrderItem.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      service_order_id: so.id,
      sequence: 1,
      name: 'Louvor',
      type: 'worship',
      start_offset_minutes: 0,
      duration_minutes: 20,
      responsible_type: 'ministry',
    },
  });
  const setlist = await admin.setlist.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      service_order_item_id: item.id,
    },
  });
  await admin.setlistSong.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      setlist_id: setlist.id,
      song_id: tocada.id,
      sequence: 1,
      title: 'Já Tocada',
    },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  token = app.get(JwtService).sign({
    sub: acct.id,
    email: acct.email,
    tenant_id: tenantId,
    congregation_id: congregationId,
    roles: ['tenant_admin'],
  });
}, 120_000);

afterAll(async () => {
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

it('devolve o catálogo com last_played_at resolvido pela setlist', async () => {
  const res = await request(app.getHttpServer())
    .get('/api/songs')
    .set('Authorization', `Bearer ${token}`);

  expect(res.status).toBe(200);
  expect(res.body).toHaveLength(2);

  const tocada = (res.body as Array<Record<string, unknown>>).find(
    (s) => s['title'] === 'Já Tocada',
  );
  const nunca = (res.body as Array<Record<string, unknown>>).find(
    (s) => s['title'] === 'Nunca Tocada',
  );

  expect(tocada?.['last_played_at']).toBe('2026-09-01T19:00:00.000Z');
  expect(nunca?.['last_played_at']).toBeNull();
});

it('responde 503 — e não 500 "Internal server error" — sem a tabela songs', async () => {
  await admin.$executeRawUnsafe('ALTER TABLE songs RENAME TO songs_bak');
  try {
    const res = await request(app.getHttpServer())
      .get('/api/songs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(503);
    expect(res.body.message).toContain('migration pendente');
    expect(res.body.message).not.toBe('Internal server error');
  } finally {
    await admin.$executeRawUnsafe('ALTER TABLE songs_bak RENAME TO songs');
  }
});

it('responde 503 sem a coluna key_alt (migration aplicada pela metade)', async () => {
  await admin.$executeRawUnsafe('ALTER TABLE songs RENAME COLUMN key_alt TO key_alt_bak');
  try {
    const res = await request(app.getHttpServer())
      .get('/api/songs')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(503);
    expect(res.body.message).toContain('migration pendente');
  } finally {
    await admin.$executeRawUnsafe('ALTER TABLE songs RENAME COLUMN key_alt_bak TO key_alt');
  }
});
