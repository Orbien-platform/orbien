/**
 * `POST /api/visitors` — cadastro de visitante pela liderança, contra o
 * Postgres de verdade e com o RLS ativo (a rota roda como `app_user`).
 *
 * Prova o que o teste de unidade não alcança: que um token de `cell_leader`
 * consegue gravar pessoa, consentimento e visita sob as policies de
 * congregação, que o duplicado por telefone vem antes de criar, e que
 * `member` continua barrado.
 *
 * Roda em `teste1-church` (`docs/AMBIENTES.md`) e apaga o que criou.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { loadTestTenant, type TestTenant } from '../helpers/test-tenants';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

const ts = Date.now();
const phone = `55119${String(ts).slice(-8)}`;
let app: INestApplication;
let tenant: TestTenant;
let accountId: string;
let tokenLeader: string;
let tokenMember: string;
const createdPersons: string[] = [];

beforeAll(async () => {
  tenant = await loadTestTenant(admin, 'teste1-church');
  const account = await admin.userAccount.create({
    data: {
      tenant_id: tenant.tenantId,
      congregation_id: tenant.congregationId,
      email: `lider-visitante-${ts}@teste1.fake`,
      password_hash: 'x',
      is_active: true,
    },
  });
  accountId = account.id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  const jwt = app.get(JwtService);
  const sign = (roles: string[]) =>
    jwt.sign({
      sub: account.id,
      email: account.email,
      tenant_id: tenant.tenantId,
      congregation_id: tenant.congregationId,
      roles,
      plan: tenant.plan,
    });
  tokenLeader = sign(['cell_leader']);
  tokenMember = sign(['member']);
}, 120_000);

afterAll(async () => {
  const persons = createdPersons.filter(Boolean);
  await admin.classificationHistory.deleteMany({ where: { person_id: { in: persons } } });
  await admin.visitRecord.deleteMany({ where: { person_id: { in: persons } } });
  await admin.consentRecord.deleteMany({ where: { person_id: { in: persons } } });
  await admin.person.deleteMany({ where: { id: { in: persons } } });
  await admin.userAccount.deleteMany({ where: { id: accountId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

const post = (token: string, body: Record<string, unknown>) =>
  request(app.getHttpServer())
    .post('/api/visitors')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

describe('POST /visitors', () => {
  it('líder de célula cadastra: pessoa visitante, consentimento e visita', async () => {
    const res = await post(tokenLeader, {
      full_name: `Visitante Líder ${ts}`,
      phone: `(${phone.slice(2, 4)}) ${phone.slice(4)}`,
      origin: 'service',
      lgpd_consent: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('registered');
    createdPersons.push(res.body.person.id);

    const person = await admin.person.findUniqueOrThrow({ where: { id: res.body.person.id } });
    expect(person.classification).toBe('visitor');
    expect(person.phone).toBe(phone.slice(2));
    expect(await admin.consentRecord.count({ where: { person_id: person.id } })).toBe(1);
    expect(await admin.visitRecord.count({ where: { person_id: person.id } })).toBe(1);
  });

  it('mesmo telefone: devolve o duplicado e não cria ninguém', async () => {
    const before = await admin.person.count({ where: { tenant_id: tenant.tenantId } });
    const res = await post(tokenLeader, {
      full_name: 'Outra Pessoa',
      phone: phone.slice(2),
      origin: 'service',
      lgpd_consent: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('duplicate');
    expect(res.body.matches).toEqual([
      expect.objectContaining({ id: createdPersons[0], visits: 1 }),
    ]);
    expect(await admin.person.count({ where: { tenant_id: tenant.tenantId } })).toBe(before);
  });

  it('"é a mesma pessoa" registra só a nova visita', async () => {
    const res = await post(tokenLeader, {
      existing_person_id: createdPersons[0],
      origin: 'event',
      lgpd_consent: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('visit_recorded');
    expect(await admin.visitRecord.count({ where: { person_id: createdPersons[0] } })).toBe(2);
  });

  it('"é outra pessoa" cria mesmo com o telefone repetido', async () => {
    const res = await post(tokenLeader, {
      full_name: `Homônimo ${ts}`,
      phone: phone.slice(2),
      origin: 'service',
      lgpd_consent: true,
      force_new: true,
    });

    expect(res.body.status).toBe('registered');
    createdPersons.push(res.body.person.id);
  });

  it('sem consentimento do visitante: 400 e nada gravado', async () => {
    const res = await post(tokenLeader, {
      full_name: 'Sem Consentimento',
      origin: 'service',
      lgpd_consent: false,
    });
    expect(res.status).toBe(400);
  });

  it('membro não cadastra visitante: 403', async () => {
    const res = await post(tokenMember, {
      full_name: 'Tentativa',
      origin: 'service',
      lgpd_consent: true,
    });
    expect(res.status).toBe(403);
  });
});
