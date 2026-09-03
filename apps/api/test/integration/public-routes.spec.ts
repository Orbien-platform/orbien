/**
 * As duas rotas públicas do produto, por HTTP.
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
