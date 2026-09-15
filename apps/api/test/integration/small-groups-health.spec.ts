/**
 * GET /api/small-groups/:id/health por HTTP (PROD-20, CEL20-04).
 *
 * `PlanGuard` já tem cobertura de unidade genérica em
 * `src/auth/guards/plan.guard.spec.ts` — o que falta provar aqui é que a
 * rota real está de fato marcada `@RequiresPlan('premium')` e que o guard de
 * classe (`PlanGuard`) chega a rodar para ela: um tenant Starter recebe 403,
 * um tenant Premium recebe 200 com o corpo calculado por
 * `SmallGroupsService.getHealth`. Mesmo padrão HTTP-completo de
 * `test/integration/notification-preferences.spec.ts`.
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
let starterToken: string;
let premiumToken: string;
let groupId: string;
const ts = Date.now();
let tenantId: string;

beforeAll(async () => {
  const tenant = await admin.tenant.create({ data: { slug: `sg-health-${ts}`, name: 'Saúde' } });
  tenantId = tenant.id;
  const cong = await admin.congregation.create({
    data: { tenant_id: tenantId, name: 'Sede' },
  });

  const groupType = await admin.groupType.create({
    data: { tenant_id: tenantId, congregation_id: cong.id, name: 'Célula' },
  });
  const leader = await admin.person.create({
    data: { tenant_id: tenantId, congregation_id: cong.id, full_name: 'Líder' },
  });
  const group = await admin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: cong.id,
      name: 'Célula Saúde',
      group_type_id: groupType.id,
      leader_person_id: leader.id,
    },
  });
  groupId = group.id;

  const account = await admin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: cong.id,
      email: `pastor-${ts}@sg-health.test`,
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
  const base = {
    sub: account.id,
    tenant_id: tenantId,
    congregation_id: cong.id,
    roles: ['pastor'],
  };
  starterToken = jwt.sign({ ...base, plan: 'starter' });
  premiumToken = jwt.sign({ ...base, plan: 'premium' });
}, 120_000);

afterAll(async () => {
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('GET /small-groups/:id/health — gate de plano (CEL20-04)', () => {
  it('tenant Starter leva 403 (spec P2 AC5)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/small-groups/${groupId}/health`)
      .set('Authorization', `Bearer ${starterToken}`);

    expect(res.status).toBe(403);
  });

  it('tenant Premium recebe 200 com o status calculado (célula nunca se reuniu → red, spec P2 AC1/AC4)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/small-groups/${groupId}/health`)
      .set('Authorization', `Bearer ${premiumToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'red',
      last_meeting_at: null,
      days_since_last_meeting: null,
    });
  });
});
