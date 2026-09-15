/**
 * GET /api/small-groups/:id/hierarchy — gate de plano (PROD-20, CEL20-06).
 *
 * `test/integration/small-groups-hierarchy.spec.ts` já cobre a árvore
 * genealógica em si, chamando `SmallGroupsService.getHierarchy` diretamente
 * (sem passar pelo `PlanGuard`, que é responsabilidade do HTTP/Nest, não do
 * service). Este arquivo prova só o gate: tenant Starter recebe 403. Mesmo
 * padrão HTTP-completo de `test/integration/small-groups-health.spec.ts`.
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
let groupId: string;
const ts = Date.now();
let tenantId: string;

beforeAll(async () => {
  const tenant = await admin.tenant.create({ data: { slug: `sg-hier-gate-${ts}`, name: 'Árvore' } });
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
      name: 'Célula Árvore',
      group_type_id: groupType.id,
      leader_person_id: leader.id,
    },
  });
  groupId = group.id;

  const account = await admin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: cong.id,
      email: `pastor-${ts}@sg-hier-gate.test`,
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
  starterToken = jwt.sign({
    sub: account.id,
    tenant_id: tenantId,
    congregation_id: cong.id,
    roles: ['pastor'],
    plan: 'starter',
  });
}, 120_000);

afterAll(async () => {
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('GET /small-groups/:id/hierarchy — gate de plano (CEL20-06)', () => {
  it('tenant Starter leva 403', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/small-groups/${groupId}/hierarchy`)
      .set('Authorization', `Bearer ${starterToken}`);

    expect(res.status).toBe(403);
  });
});
