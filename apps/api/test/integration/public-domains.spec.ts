/**
 * Domínio próprio, por HTTP e contra o banco (PEND-04, ação C).
 *
 * `GET /public/domains/resolve` é o que o middleware do `apps/web` chama a cada
 * requisição de host desconhecido; `GET /public/domains/cloudflare/callback`
 * é o retorno do OAuth, sem JWT. As duas rodam como `orbien_app` sem
 * `app.tenant_id` — e `orbien_app` já não lê `branding_configs` por
 * `USING (true)`. A primeira passa por `public_domain_resolve` (034); a
 * segunda fixa o tenant do `state` assinado antes de tocar a linha.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { of } from 'rxjs';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DomainProvisioningService } from '../../src/domain-provisioning/domain-provisioning.service';
import { SecretCipher } from '../../src/common/crypto/secret-cipher';

const admin = new PrismaClient({
  datasources: { db: { url: process.env['DIRECT_URL']! } },
  log: [],
});

const ts = Date.now();
const slug = `dom-${ts}`;
const otherSlug = `dom-b-${ts}`;
const verifiedHost = `doar-${ts}.igreja.test`;
const pendingHost = `pendente-${ts}.igreja.test`;
const oauthHost = `oauth-${ts}.igreja.test`;

let app: INestApplication;
let service: DomainProvisioningService;
let tenantId: string;
let otherTenantId: string;
const originalEnv = { ...process.env };

beforeAll(async () => {
  Object.assign(process.env, {
    DOMAIN_SECRETS_ENCRYPTION_KEY: 'c'.repeat(64),
    CLOUDFLARE_OAUTH_CLIENT_ID: 'cf-client',
    CLOUDFLARE_OAUTH_CLIENT_SECRET: 'cf-secret',
    CLOUDFLARE_OAUTH_REDIRECT_URI: 'https://api.test/public/domains/cloudflare/callback',
    VERCEL_API_TOKEN: 'vercel-token',
    VERCEL_WEB_PROJECT_ID: 'prj_web',
    FRONTEND_URL: 'https://web.test',
  });

  const a = await admin.tenant.create({ data: { slug, name: 'Domínio A' } });
  const b = await admin.tenant.create({ data: { slug: otherSlug, name: 'Domínio B' } });
  tenantId = a.id;
  otherTenantId = b.id;
  await admin.congregation.create({ data: { tenant_id: tenantId, name: 'A — Sede' } });
  await admin.congregation.create({ data: { tenant_id: otherTenantId, name: 'B — Sede' } });
  await admin.brandingConfig.create({
    data: {
      tenant_id: tenantId,
      custom_domain: verifiedHost,
      custom_domain_status: 'verified',
    },
  });
  await admin.brandingConfig.create({
    data: {
      tenant_id: otherTenantId,
      custom_domain: pendingHost,
      custom_domain_status: 'pending',
    },
  });

  // Cloudflare e Vercel não existem aqui: o HTTP de saída é stub.
  const http = {
    get: (url: string) => {
      if (url.includes('/zones?')) {
        return of({ data: { result: [{ id: 'zone-1', name: 'igreja.test' }] } });
      }
      if (url.includes('dns_records')) return of({ data: { result: [] } });
      if (url.includes('vercel.com')) return of({ data: { verified: true } });
      return of({ data: {} });
    },
    post: (url: string) =>
      url.includes('oauth2/token')
        ? of({ data: { access_token: 'cf-access', refresh_token: 'cf-refresh', expires_in: 3600 } })
        : of({ data: {} }),
    put: () => of({ data: {} }),
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(HttpService)
    .useValue(http)
    .compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();
  service = app.get(DomainProvisioningService);
}, 120_000);

afterAll(async () => {
  await admin.brandingConfig.deleteMany({ where: { tenant_id: { in: [tenantId, otherTenantId] } } });
  await admin.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
  await admin.$disconnect();
  await app?.close();
  process.env = originalEnv;
}, 60_000);

describe('GET /api/public/domains/resolve', () => {
  it('domínio verificado resolve para o slug do tenant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public/domains/resolve')
      .query({ host: verifiedHost });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tenant_slug: slug });
  });

  it('domínio pendente não resolve — mesmo cadastrado', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/public/domains/resolve')
      .query({ host: pendingHost });
    expect(res.status).toBe(404);
  });

  it('host desconhecido, prefixo e curinga dão 404 (sem enumeração)', async () => {
    for (const host of ['nao-existe.igreja.test', 'doar-', '%', `%${verifiedHost.slice(-8)}`]) {
      const res = await request(app.getHttpServer()).get('/api/public/domains/resolve').query({ host });
      expect(res.status).toBe(404);
    }
  });
});

describe('GET /api/public/domains/cloudflare/callback', () => {
  it('grava os tokens cifrados só na marca do tenant do state e marca o domínio verificado', async () => {
    await admin.brandingConfig.update({
      where: { tenant_id: tenantId },
      data: { custom_domain: oauthHost, custom_domain_status: 'pending' },
    });
    const state = service.buildAuthorizeUrl(tenantId).url.match(/state=([^&]+)/)![1]!;

    const res = await request(app.getHttpServer())
      .get('/api/public/domains/cloudflare/callback')
      .query({ code: 'auth-code', state: decodeURIComponent(state) });
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('https://web.test/configuracoes?dominio=conectado');

    const a = await admin.brandingConfig.findUniqueOrThrow({ where: { tenant_id: tenantId } });
    expect(a.cloudflare_zone_id).toBe('zone-1');
    expect(a.custom_domain_status).toBe('verified');
    expect(new SecretCipher().decrypt(a.cloudflare_access_token_encrypted!)).toBe('cf-access');
    // O outro tenant não foi tocado.
    const b = await admin.brandingConfig.findUniqueOrThrow({ where: { tenant_id: otherTenantId } });
    expect(b.cloudflare_access_token_encrypted).toBeNull();
    expect(b.custom_domain_status).toBe('pending');
  });

  it('state adulterado não grava nada e não derruba o servidor', async () => {
    const before = await admin.brandingConfig.findUniqueOrThrow({ where: { tenant_id: otherTenantId } });
    const res = await request(app.getHttpServer())
      .get('/api/public/domains/cloudflare/callback')
      .query({ code: 'auth-code', state: 'lixo.nao-assinado' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const after = await admin.brandingConfig.findUniqueOrThrow({ where: { tenant_id: otherTenantId } });
    expect(after.updated_at).toEqual(before.updated_at);
  });
});
