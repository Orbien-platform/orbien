/**
 * Troca de escala entre voluntários (v2, "Minhas escalas" → Trocas) por HTTP,
 * contra o Postgres de verdade e com o RLS ativo (as rotas rodam como
 * `app_user` pelo `TenantContextInterceptor`).
 *
 * Prova o que o teste de unidade não alcança: que um voluntário comum
 * consegue gravar o pedido e, do outro lado, um colega consegue aceitar —
 * a atribuição original vira `swapped` e a do colega nasce confirmada, sob as
 * policies de congregação de `celebration_assignments` e
 * `assignment_swap_requests` (025). E que quem não serve no ministério não
 * vê nem aceita.
 *
 * Roda em `teste2-church` (`docs/AMBIENTES.md`) — as rotas são Premium — e
 * apaga o que criou.
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
let app: INestApplication;
let tenant: TestTenant;
const personIds: string[] = [];
const accountIds: string[] = [];
let ministryId: string;
let celebrationId: string;
let profileAna: string;
let profileBia: string;
let assignmentAna: string;
let tokenAna: string;
let tokenBia: string;
let tokenCaio: string;

beforeAll(async () => {
  tenant = await loadTestTenant(admin, 'teste2-church');
  const scope = { tenant_id: tenant.tenantId, congregation_id: tenant.congregationId };

  ministryId = (await admin.ministry.create({ data: { ...scope, name: `Mídia troca ${ts}` } })).id;

  const voluntario = async (nome: string, noMinisterio: boolean) => {
    const person = await admin.person.create({
      data: { ...scope, full_name: `${nome} Troca ${ts}`, classification: 'member' },
    });
    personIds.push(person.id);
    const account = await admin.userAccount.create({
      data: {
        ...scope,
        person_id: person.id,
        email: `${nome.toLowerCase()}-troca-${ts}@teste2.fake`,
        password_hash: 'x',
        is_active: true,
      },
    });
    accountIds.push(account.id);
    const profile = await admin.volunteerProfile.create({
      data: { ...scope, person_id: person.id, availability: {}, skills: ['OBS'] },
    });
    if (noMinisterio) {
      await admin.volunteerMinistry.create({
        data: { ...scope, volunteer_profile_id: profile.id, ministry_id: ministryId },
      });
    }
    return { account, profile };
  };
  const ana = await voluntario('Ana', true);
  const bia = await voluntario('Bia', true);
  const caio = await voluntario('Caio', false);
  profileAna = ana.profile.id;
  profileBia = bia.profile.id;

  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 10);
  celebrationId = (
    await admin.celebration.create({
      data: {
        ...scope,
        name: `Culto troca ${ts}`,
        type: 'sunday_service',
        start_time: '09:30',
        recurrence: 'none',
      },
    })
  ).id;
  const instance = await admin.celebrationInstance.create({
    data: { ...scope, celebration_id: celebrationId, scheduled_date: date },
  });
  const schedule = await admin.celebrationSchedule.create({
    data: { ...scope, celebration_instance_id: instance.id, status: 'published' },
  });
  const slot = await admin.celebrationMinistry.create({
    data: { ...scope, schedule_id: schedule.id, ministry_id: ministryId, slots: 2 },
  });
  assignmentAna = (
    await admin.celebrationAssignment.create({
      data: { ...scope, celebration_ministry_id: slot.id, volunteer_profile_id: profileAna },
    })
  ).id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  const jwt = app.get(JwtService);
  const sign = (account: { id: string; email: string }) =>
    jwt.sign({
      sub: account.id,
      email: account.email,
      ...scope,
      roles: ['member'],
      plan: tenant.plan,
    });
  tokenAna = sign(ana.account);
  tokenBia = sign(bia.account);
  tokenCaio = sign(caio.account);
}, 120_000);

afterAll(async () => {
  await admin.celebration.deleteMany({ where: { id: celebrationId } });
  await admin.volunteerProfile.deleteMany({ where: { person_id: { in: personIds } } });
  await admin.ministry.deleteMany({ where: { id: ministryId } });
  await admin.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await admin.person.deleteMany({ where: { id: { in: personIds } } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

const api = () => request(app.getHttpServer());
const as = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('troca de escala', () => {
  let requestId: string;

  it('quem está escalado vê os colegas do ministério como substitutos', async () => {
    const res = await api()
      .get(`/api/assignments/${assignmentAna}/swap-candidates`)
      .set(as(tokenAna));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { volunteer_profile_id: profileBia, full_name: `Bia Troca ${ts}`, availability: 'free' },
    ]);
  });

  it('pedir troca da escala de outra pessoa: 403', async () => {
    const res = await api()
      .post(`/api/assignments/${assignmentAna}/swap-requests`)
      .set(as(tokenBia))
      .send({});
    expect(res.status).toBe(403);
  });

  it('pede ao ministério; um segundo pedido para a mesma escala é 409', async () => {
    const res = await api()
      .post(`/api/assignments/${assignmentAna}/swap-requests`)
      .set(as(tokenAna))
      .send({ message: 'Viagem em família' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'pending', target: null, message: 'Viagem em família' });
    requestId = res.body.id;

    const again = await api()
      .post(`/api/assignments/${assignmentAna}/swap-requests`)
      .set(as(tokenAna))
      .send({});
    expect(again.status).toBe(409);
  });

  it('o colega do ministério recebe o pedido; quem não serve nele, não', async () => {
    const bia = await api().get('/api/volunteers/my-swap-requests').set(as(tokenBia));
    expect(bia.status).toBe(200);
    expect(bia.body.incoming.map((r: { id: string }) => r.id)).toEqual([requestId]);

    const caio = await api().get('/api/volunteers/my-swap-requests').set(as(tokenCaio));
    expect(caio.body.incoming).toEqual([]);

    const ana = await api().get('/api/volunteers/my-swap-requests').set(as(tokenAna));
    expect(ana.body.outgoing.map((r: { id: string }) => r.id)).toEqual([requestId]);
    expect(ana.body.incoming).toEqual([]);
  });

  it('quem não serve no ministério não aceita: 403', async () => {
    const res = await api().patch(`/api/swap-requests/${requestId}/accept`).set(as(tokenCaio));
    expect(res.status).toBe(403);
  });

  it('o colega aceita: a escala dela vira swapped e a dele nasce confirmada', async () => {
    const res = await api().patch(`/api/swap-requests/${requestId}/accept`).set(as(tokenBia));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('accepted');
    expect(res.body.accepted_by.volunteer_profile_id).toBe(profileBia);

    const original = await admin.celebrationAssignment.findUniqueOrThrow({
      where: { id: assignmentAna },
    });
    expect(original.status).toBe('swapped');
    const novo = await admin.celebrationAssignment.findFirstOrThrow({
      where: { volunteer_profile_id: profileBia, celebrationMinistry: { ministry_id: ministryId } },
    });
    expect(novo.status).toBe('confirmed');

    const bia = await api().get('/api/volunteers/my-celebration-assignments').set(as(tokenBia));
    expect(bia.body.map((a: { id: string }) => a.id)).toContain(novo.id);
  });

  it('aceitar de novo: 409', async () => {
    const res = await api().patch(`/api/swap-requests/${requestId}/accept`).set(as(tokenBia));
    expect(res.status).toBe(409);
  });
});

describe('GET /volunteers/me/profile', () => {
  it('devolve o perfil da conta do token, com o ministério', async () => {
    const res = await api().get('/api/volunteers/me/profile').set(as(tokenBia));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: profileBia,
      skills: ['OBS'],
      ministries: [{ id: ministryId, name: `Mídia troca ${ts}`, role: 'volunteer' }],
      served_count: 0,
    });
  });
});
