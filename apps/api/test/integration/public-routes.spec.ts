/**
 * As rotas públicas do produto, por HTTP.
 *
 * Elas são as únicas que não passam pelo `TenantContextInterceptor` — e foi
 * exatamente por isso que quebraram sozinhas e ficaram meses assim: `get
 * client()` devolvia o alvo do Proxy do Prisma, sem delegates de modelo, e só
 * quem roda fora de transação sente. Nenhum teste as cobria; a suíte de RLS
 * chamava o Prisma direto, sem passar pelo Nest, então media a policy e não o
 * caminho.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

let app: INestApplication;
let http: () => request.Agent;

const ts = Date.now();
const slug = `pub-${ts}`;
let tenantId: string;
let congregationId: string;
let qrToken: string;
let publicGroupId: string;
let privateGroupId: string;

beforeAll(async () => {
  const tenant = await admin.tenant.create({ data: { slug, name: 'Tenant Público' } });
  tenantId = tenant.id;

  const cong = await admin.congregation.create({
    data: { tenant_id: tenantId, name: 'Público — Sede' },
  });
  congregationId = cong.id;

  const qr = await admin.qrToken.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      origin: 'service',
      created_by: 'integration-test',
    },
  });
  qrToken = qr.token;

  // PROD-13 — duas células, uma pública e uma não, para a listagem de
  // "Encontre uma célula" e o pedido de visita.
  const groupType = await admin.groupType.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Célula' },
  });
  const leader = await admin.person.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      full_name: `Líder ${ts}`,
      classification: 'member',
    },
  });
  const publicGroup = await admin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name: `Célula Pública ${ts}`,
      group_type_id: groupType.id,
      leader_person_id: leader.id,
      is_public: true,
      public_description: 'Toda quinta, 19h30',
      address: 'Rua das Flores, 100',
      lat: '-23.5505199',
      lng: '-46.6333094',
      meeting_time: '19:30',
    },
  });
  publicGroupId = publicGroup.id;

  const privateGroup = await admin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name: `Célula Privada ${ts}`,
      group_type_id: groupType.id,
      leader_person_id: leader.id,
      is_public: false,
    },
  });
  privateGroupId = privateGroup.id;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();

  http = () => request(app.getHttpServer());
}, 120_000);

afterAll(async () => {
  await admin.waitlistSubscriber.deleteMany({ where: { email: { contains: String(ts) } } });
  await admin.qrToken.deleteMany({ where: { tenant_id: tenantId } });
  await admin.smallGroupVisitRequest.deleteMany({ where: { tenant_id: tenantId } });
  await admin.smallGroup.deleteMany({ where: { tenant_id: tenantId } });
  await admin.person.deleteMany({ where: { tenant_id: tenantId } });
  await admin.tenant.deleteMany({ where: { id: tenantId } });
  await admin.$disconnect();
  await app?.close();
}, 60_000);

describe('POST /api/public/waitlist', () => {
  it('grava o lead e a linha existe no banco', async () => {
    const email = `lead-${ts}@publico.test`;

    const res = await http()
      .post('/api/public/waitlist')
      .send({
        email,
        pastor_name: 'Pastor Público',
        size_range: 'ate_150',
        lgpd_consent: true,
      })
      .expect(200);

    expect(res.body).toEqual({ success: true });

    // A asserção que importa: o `{success:true}` também é a resposta para email
    // duplicado (P2002 é engolido de propósito), então só a linha prova que
    // gravou.
    const gravado = await admin.waitlistSubscriber.findUnique({ where: { email } });
    expect(gravado).not.toBeNull();
  });

  it('recusa cadastro sem consentimento LGPD', async () => {
    await http()
      .post('/api/public/waitlist')
      .send({
        email: `sem-consent-${ts}@publico.test`,
        pastor_name: 'Pastor Público',
        size_range: 'ate_150',
        lgpd_consent: false,
      })
      .expect(400);
  });
});

describe('POST /api/public/visitor/register', () => {
  it('QR inválido responde 404 — e chega até a consulta para saber disso', async () => {
    // Este é o teste que teria pego o bug do `client`: a primeira linha do
    // serviço é um `findUnique` em qr_tokens, e ela estourava com TypeError
    // (500) em vez de chegar ao 404.
    await http()
      .post('/api/public/visitor/register')
      .send({ token: 'token-que-nao-existe', full_name: 'Visitante', lgpd_consent: true })
      .expect(404);
  });

  // Este passava a falhar com `42501` em `persons` mesmo depois de corrigido o
  // `client`: rota pública não tem JWT, e a policy por tenant negava a escrita.
  // O contexto agora vem do QR token — ver o comentário em registerViaQr.
  it('registra o visitante e incrementa o contador do QR', async () => {
    const res = await http()
      .post('/api/public/visitor/register')
      .send({ token: qrToken, full_name: `Visitante ${ts}`, lgpd_consent: true })
      .expect(200);

    expect(res.body).toEqual({
      status: 'registered',
      message: 'Cadastro realizado! Bem-vindo à Público — Sede.',
    });

    const pessoa = await admin.person.findFirst({
      where: { tenant_id: tenantId, full_name: `Visitante ${ts}` },
    });
    expect(pessoa).not.toBeNull();

    const qr = await admin.qrToken.findUnique({ where: { token: qrToken } });
    expect(qr?.scan_count).toBe(1);
  });
});

/**
 * PROD-13 — "Encontre uma célula". Mesma razão de existir do bloco do QR
 * acima: rota pública não passa pelo TenantContextInterceptor, então o que
 * ela faz com RLS só aparece contra o banco de verdade. Aqui isso é literal —
 * o insert do pedido de visita é `$executeRaw` justamente porque o `create` do
 * Prisma usa RETURNING e o plano público não pode ler a linha de volta; um
 * teste com Prisma mockado nunca veria esse 42501.
 */
describe('GET /api/public/small-groups', () => {
  it('lista só a célula pública da igreja, com endereço e coordenada', async () => {
    const res = await http().get('/api/public/small-groups').query({ tenant_slug: slug }).expect(200);

    expect(res.body.church_name).toBe('Tenant Público');
    const ids = res.body.groups.map((g: { id: string }) => g.id);
    expect(ids).toEqual([publicGroupId]);
    expect(ids).not.toContain(privateGroupId);

    expect(res.body.groups[0]).toMatchObject({
      name: `Célula Pública ${ts}`,
      description: 'Toda quinta, 19h30',
      address: 'Rua das Flores, 100',
      lat: -23.5505199,
      lng: -46.6333094,
      meeting_time: '19:30',
      congregation: { id: congregationId, name: 'Público — Sede' },
    });
  });

  it('404 para igreja que não existe', async () => {
    await http()
      .get('/api/public/small-groups')
      .query({ tenant_slug: `nao-existe-${ts}` })
      .expect(404);
  });

  it('400 sem tenant_slug', async () => {
    await http().get('/api/public/small-groups').expect(400);
  });
});

describe('POST /api/public/small-groups/:id/visit-request', () => {
  it('grava o pedido — a linha no banco é a prova, a resposta não devolve a linha', async () => {
    const res = await http()
      .post(`/api/public/small-groups/${publicGroupId}/visit-request`)
      .send({
        tenant_slug: slug,
        visitor_name: `Interessada ${ts}`,
        visitor_phone: '11999990000',
        message: 'posso levar meu filho?',
      })
      .expect(200);

    expect(res.body.status).toBe('received');

    const saved = await admin.smallGroupVisitRequest.findMany({
      where: { small_group_id: publicGroupId },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      congregation_id: congregationId,
      visitor_name: `Interessada ${ts}`,
      visitor_phone: '11999990000',
      message: 'posso levar meu filho?',
      visitor_email: null,
    });
  });

  it('404 em célula não pública — ela não existe para quem está de fora', async () => {
    await http()
      .post(`/api/public/small-groups/${privateGroupId}/visit-request`)
      .send({ tenant_slug: slug, visitor_name: 'Alguém', visitor_phone: '11999990000' })
      .expect(404);

    const saved = await admin.smallGroupVisitRequest.findMany({
      where: { small_group_id: privateGroupId },
    });
    expect(saved).toHaveLength(0);
  });

  it('400 sem telefone nem e-mail', async () => {
    await http()
      .post(`/api/public/small-groups/${publicGroupId}/visit-request`)
      .send({ tenant_slug: slug, visitor_name: 'Sem contato' })
      .expect(400);
  });

  it('honeypot responde 200 e não grava', async () => {
    await http()
      .post(`/api/public/small-groups/${publicGroupId}/visit-request`)
      .send({
        tenant_slug: slug,
        visitor_name: `Robô ${ts}`,
        visitor_phone: '11999990000',
        website: 'http://spam',
      })
      .expect(200);

    const saved = await admin.smallGroupVisitRequest.findMany({
      where: { visitor_name: `Robô ${ts}` },
    });
    expect(saved).toHaveLength(0);
  });
});
