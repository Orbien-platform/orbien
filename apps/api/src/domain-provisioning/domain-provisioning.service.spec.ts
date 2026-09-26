/**
 * O que mais importa nesta suíte:
 *
 *   1. **O `state` do OAuth é a única prova de qual tenant iniciou a
 *      conexão** — o callback não tem Authorization header. Um `state`
 *      inválido/adulterado tem que rejeitar antes de tocar em qualquer
 *      credencial.
 *   2. **`proxied: false` no registro CNAME da Cloudflare não é opcional**
 *      — com o proxy ligado a Vercel não emite certificado. O teste do
 *      upsert prova que o corpo enviado sempre carrega isso.
 *   3. **`resolveTenantSlugByHost` só resolve domínio `verified`** — é o que
 *      o middleware de host do `apps/web` usa para decidir se serve o
 *      tenant ou deixa cair no roteamento normal; resolver um `pending`
 *      serviria conteúdo de igreja errada atrás de um domínio que ninguém
 *      confirmou ainda.
 */

import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { DomainProvisioningService } from './domain-provisioning.service';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipher } from '../common/crypto/secret-cipher';
import { SignedState } from '../common/crypto/signed-state';

const ENV_BASE = {
  DOMAIN_SECRETS_ENCRYPTION_KEY: 'c'.repeat(64),
  CLOUDFLARE_OAUTH_CLIENT_ID: 'cf-client',
  CLOUDFLARE_OAUTH_CLIENT_SECRET: 'cf-secret',
  CLOUDFLARE_OAUTH_REDIRECT_URI: 'https://api.useorbien.com/public/domains/cloudflare/callback',
  VERCEL_API_TOKEN: 'vercel-token',
  VERCEL_WEB_PROJECT_ID: 'prj_web',
  FRONTEND_URL: 'https://web.useorbien.com',
};

type Branding = {
  tenant_id: string;
  custom_domain: string | null;
  custom_domain_status: string;
  cloudflare_access_token_encrypted: string | null;
  cloudflare_refresh_token_encrypted: string | null;
  cloudflare_token_expires_at: Date | null;
  cloudflare_zone_id: string | null;
};

function harness(opts: {
  branding?: Partial<Branding>;
  brandingMissing?: boolean;
  tenantSlug?: string | null;
  httpGet?: (url: string) => unknown;
  httpPost?: (url: string, body: unknown) => unknown;
  httpPut?: (url: string, body: unknown) => unknown;
} = {}) {
  const branding: Branding = {
    tenant_id: 't1',
    custom_domain: null,
    custom_domain_status: 'pending',
    cloudflare_access_token_encrypted: null,
    cloudflare_refresh_token_encrypted: null,
    cloudflare_token_expires_at: null,
    cloudflare_zone_id: null,
    ...opts.branding,
  };
  const updates: Record<string, unknown>[] = [];

  const prisma = {
    client: {
      brandingConfig: {
        findUnique: jest.fn(() => Promise.resolve(opts.brandingMissing ? null : branding)),
        findFirst: jest.fn(() =>
          Promise.resolve(
            branding.custom_domain && branding.custom_domain_status === 'verified' ? branding : null,
          ),
        ),
        update: jest.fn(({ data }: { data: Partial<Branding> }) => {
          updates.push(data);
          Object.assign(branding, data);
          return Promise.resolve(branding);
        }),
      },
      tenant: {
        findUnique: jest.fn(() =>
          Promise.resolve(opts.tenantSlug ? { slug: opts.tenantSlug } : null),
        ),
      },
    },
  } as unknown as PrismaService;

  const http = {
    get: jest.fn((url: string) =>
      opts.httpGet ? asObservable(opts.httpGet(url)) : of({ data: {} }),
    ),
    post: jest.fn((url: string, body: unknown) =>
      opts.httpPost ? asObservable(opts.httpPost(url, body)) : of({ data: {} }),
    ),
    put: jest.fn((url: string, body: unknown) =>
      opts.httpPut ? asObservable(opts.httpPut(url, body)) : of({ data: {} }),
    ),
  } as unknown as HttpService;

  function asObservable(result: unknown) {
    if (result instanceof Error) return throwError(() => result);
    return of({ data: result });
  }

  const service = new DomainProvisioningService(prisma, http, new SecretCipher(), new SignedState());
  return { service, branding, updates, http, prisma };
}

describe('DomainProvisioningService', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, ...ENV_BASE };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getStatus', () => {
    it('sem custom_domain, não devolve instrução manual nenhuma', async () => {
      const { service } = harness();
      const status = await service.getStatus('t1');
      expect(status.manual_instructions).toBeNull();
      expect(status.cloudflare_connected).toBe(false);
    });

    it('com custom_domain, devolve CNAME para a Vercel e a alternativa A para domínio raiz', async () => {
      const { service } = harness({ branding: { custom_domain: 'doar.igreja.com.br' } });
      const status = await service.getStatus('t1');
      expect(status.manual_instructions).toEqual({
        cname: { name: 'doar.igreja.com.br', value: 'cname.vercel-dns.com' },
        apex_alternative: { name: 'doar.igreja.com.br', type: 'A', value: '76.76.21.21' },
        note: expect.stringContaining('CNAME'),
      });
    });

    it('sem BrandingConfig nenhum ainda (tenant novo), devolve pending em vez de quebrar', async () => {
      const { service } = harness({ brandingMissing: true });
      const status = await service.getStatus('t1');
      expect(status).toEqual({
        custom_domain: null,
        status: 'pending',
        cloudflare_connected: false,
        manual_instructions: null,
      });
    });

    it('marca cloudflare_connected quando há token cifrado guardado', async () => {
      const { service } = harness({
        branding: { cloudflare_access_token_encrypted: 'algo-cifrado' },
      });
      expect((await service.getStatus('t1')).cloudflare_connected).toBe(true);
    });
  });

  describe('requestManualVerification', () => {
    it('sem custom_domain cadastrado, recusa antes de chamar qualquer provedor', async () => {
      const { service, http } = harness();
      await expect(service.requestManualVerification('t1')).rejects.toThrow(BadRequestException);
      expect(http.post).not.toHaveBeenCalled();
    });

    it('registra na Vercel e marca verified quando a Vercel confirma', async () => {
      const { service, branding } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpGet: (url) => (url.includes('vercel.com') ? { verified: true } : {}),
      });
      const status = await service.requestManualVerification('t1');
      expect(status.status).toBe('verified');
      expect(branding.custom_domain_status).toBe('verified');
    });

    it('fica pending quando a Vercel ainda não verificou', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpGet: () => ({ verified: false }),
      });
      expect((await service.requestManualVerification('t1')).status).toBe('pending');
    });
  });

  describe('buildAuthorizeUrl', () => {
    it('sem CLOUDFLARE_OAUTH_CLIENT_ID configurado, recusa', () => {
      delete process.env['CLOUDFLARE_OAUTH_CLIENT_ID'];
      const { service } = harness();
      expect(() => service.buildAuthorizeUrl('t1')).toThrow(ServiceUnavailableException);
    });

    it('devolve URL de autorização da Cloudflare com state assinado', () => {
      const { service } = harness();
      const { url } = service.buildAuthorizeUrl('t1');
      expect(url).toContain('https://dash.cloudflare.com/oauth2/auth');
      expect(url).toContain('client_id=cf-client');
      expect(url).toContain('state=');
    });
  });

  describe('handleOAuthCallback', () => {
    it('state adulterado nunca chega a trocar código por token', async () => {
      const { service, http } = harness();
      await expect(service.handleOAuthCallback('code', 'lixo.nao-assinado')).rejects.toThrow();
      expect(http.post).not.toHaveBeenCalled();
    });

    it('conecta, cria o CNAME sem proxy e registra o domínio na Vercel', async () => {
      const { service, branding, http } = harness({
        branding: { custom_domain: 'doar.igreja.com.br' },
        httpPost: (url) => {
          if (url.includes('oauth2/token')) {
            return { access_token: 'at', refresh_token: 'rt', expires_in: 3600 };
          }
          return {};
        },
        httpGet: (url) => {
          if (url.includes('/zones?')) {
            return url.includes('igreja.com.br')
              ? { result: [{ id: 'zone-1', name: 'igreja.com.br' }] }
              : { result: [] };
          }
          if (url.includes('dns_records')) return { result: [] };
          if (url.includes('vercel.com')) return { verified: true };
          return {};
        },
      });
      const state = service.buildAuthorizeUrl('t1').url.match(/state=([^&]+)/)![1]!;

      const redirect = await service.handleOAuthCallback('auth-code', decodeURIComponent(state));

      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=conectado');
      expect(branding.cloudflare_access_token_encrypted).toBeTruthy();
      // Nunca em texto claro no banco — decifrar é a única forma de confirmar
      // o valor; um `toContain` no cifrado é frágil (base64 aleatório pode
      // conter a substring do plaintext por coincidência).
      expect(new SecretCipher().decrypt(branding.cloudflare_access_token_encrypted!)).toBe('at');
      expect(branding.custom_domain_status).toBe('verified');

      const dnsCall = (http.post as jest.Mock).mock.calls.find(([url]) =>
        url.includes('/zones/zone-1/dns_records'),
      );
      expect(dnsCall![1]).toMatchObject({ type: 'CNAME', proxied: false, content: 'cname.vercel-dns.com' });
    });

    it('falha na Cloudflare redireciona com erro em vez de propagar exceção pro navegador', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpPost: () => new Error('cloudflare fora do ar'),
      });
      const state = service.buildAuthorizeUrl('t1').url.match(/state=([^&]+)/)![1]!;
      const redirect = await service.handleOAuthCallback('code', decodeURIComponent(state));
      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=erro');
    });

    it('sem FRONTEND_URL configurado, redireciona pro fallback (web.useorbien.com)', async () => {
      delete process.env['FRONTEND_URL'];
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpPost: () => new Error('cloudflare fora do ar'),
      });
      const state = service.buildAuthorizeUrl('t1').url.match(/state=([^&]+)/)![1]!;
      const redirect = await service.handleOAuthCallback('code', decodeURIComponent(state));
      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=erro');
    });

    it('rejeição que não é Error (dependência mal comportada) ainda cai no redirect de erro', async () => {
      const { service, prisma } = harness({ branding: { custom_domain: 'doar.igreja.com' } });
      (prisma.client.brandingConfig.update as jest.Mock).mockImplementationOnce(() =>
        Promise.reject('falha crua, não é instância de Error'),
      );
      const state = service.buildAuthorizeUrl('t1').url.match(/state=([^&]+)/)![1]!;
      const redirect = await service.handleOAuthCallback('code', decodeURIComponent(state));
      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=erro');
    });
  });

  describe('disconnectCloudflare', () => {
    it('limpa os quatro campos da conexão', async () => {
      const { service, branding } = harness({
        branding: {
          cloudflare_access_token_encrypted: 'a',
          cloudflare_refresh_token_encrypted: 'b',
          cloudflare_zone_id: 'zone-1',
        },
      });
      await service.disconnectCloudflare('t1');
      expect(branding.cloudflare_access_token_encrypted).toBeNull();
      expect(branding.cloudflare_refresh_token_encrypted).toBeNull();
      expect(branding.cloudflare_zone_id).toBeNull();
    });
  });

  describe('resolveTenantSlugByHost', () => {
    it('domínio pending não resolve — evita servir tenant antes da verificação', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com', custom_domain_status: 'pending' },
      });
      await expect(service.resolveTenantSlugByHost('doar.igreja.com')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('domínio verified resolve para o slug do tenant', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com', custom_domain_status: 'verified' },
        tenantSlug: 'igreja-modelo',
      });
      expect(await service.resolveTenantSlugByHost('doar.igreja.com')).toEqual({
        tenant_slug: 'igreja-modelo',
      });
    });
  });

  describe('registerOnVercel / checkVercelVerification (via requestManualVerification)', () => {
    it('sem VERCEL_API_TOKEN/VERCEL_WEB_PROJECT_ID, recusa antes de tentar registrar', async () => {
      delete process.env['VERCEL_API_TOKEN'];
      const { service } = harness({ branding: { custom_domain: 'doar.igreja.com' } });
      await expect(service.requestManualVerification('t1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('409 da Vercel (domínio já registrado no projeto) não é falha', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpPost: () => Object.assign(new Error('já existe'), { response: { status: 409 } }),
        httpGet: () => ({ verified: true }),
      });
      const status = await service.requestManualVerification('t1');
      expect(status.status).toBe('verified');
    });

    it('erro diferente de 409 ao registrar na Vercel propaga como indisponível', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpPost: () => Object.assign(new Error('fora do ar'), { response: { status: 500 } }),
      });
      await expect(service.requestManualVerification('t1')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('404 ao checar verificação vira "domínio não encontrado no projeto"', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpGet: () => Object.assign(new Error('não achei'), { response: { status: 404 } }),
      });
      await expect(service.requestManualVerification('t1')).rejects.toThrow(NotFoundException);
    });

    it('erro de rede ao checar verificação não derruba a request — fica pending', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpGet: () => Object.assign(new Error('timeout'), { response: undefined }),
      });
      const status = await service.requestManualVerification('t1');
      expect(status.status).toBe('pending');
    });
  });

  describe('provisionViaCloudflare (via handleOAuthCallback)', () => {
    function stateFor(service: DomainProvisioningService, tenantId: string) {
      const { url } = service.buildAuthorizeUrl(tenantId);
      return decodeURIComponent(url.match(/state=([^&]+)/)![1]!);
    }

    it('nenhuma zona encontrada: não cria registro nenhum, e não derruba o callback', async () => {
      const { service, branding, http } = harness({
        branding: { custom_domain: 'doar.igreja.com.br' },
        httpPost: (url) =>
          url.includes('oauth2/token') ? { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } : {},
        httpGet: (url) => (url.includes('/zones?') ? { result: [] } : {}),
      });
      const state = stateFor(service, 't1');

      const redirect = await service.handleOAuthCallback('code', state);

      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=conectado');
      expect(branding.cloudflare_zone_id).toBeNull();
      expect(branding.custom_domain_status).toBe('pending');
      expect(http.post).not.toHaveBeenCalledWith(
        expect.stringContaining('/dns_records'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('registro CNAME já existe: atualiza (PUT) em vez de criar (POST)', async () => {
      const { service, http } = harness({
        branding: { custom_domain: 'doar.igreja.com.br' },
        httpPost: (url) =>
          url.includes('oauth2/token') ? { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } : {},
        httpGet: (url) => {
          if (url.includes('/zones?')) return { result: [{ id: 'zone-1', name: 'igreja.com.br' }] };
          if (url.includes('/dns_records')) return { result: [{ id: 'rec-1' }] };
          if (url.includes('vercel.com')) return { verified: true };
          return {};
        },
      });
      const state = stateFor(service, 't1');

      await service.handleOAuthCallback('code', state);

      expect(http.put).toHaveBeenCalledWith(
        expect.stringContaining('/zones/zone-1/dns_records/rec-1'),
        expect.objectContaining({ proxied: false, content: 'cname.vercel-dns.com' }),
        expect.anything(),
      );
      const dnsPost = (http.post as jest.Mock).mock.calls.find(([url]) => url.includes('/dns_records'));
      expect(dnsPost).toBeUndefined();
    });

    it('erro da Cloudflare ao listar zona é traduzido e redireciona com erro', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com.br' },
        httpPost: (url) =>
          url.includes('oauth2/token') ? { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } : {},
        httpGet: (url) => (url.includes('/zones?') ? new Error('cloudflare indisponível') : {}),
      });
      const state = stateFor(service, 't1');

      const redirect = await service.handleOAuthCallback('code', state);

      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=erro');
    });

    it('erro da Cloudflare ao criar o registro DNS é traduzido e redireciona com erro', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com.br' },
        httpPost: (url) => {
          if (url.includes('oauth2/token')) return { access_token: 'at', refresh_token: 'rt', expires_in: 3600 };
          if (url.includes('/dns_records')) return new Error('falha ao criar registro');
          return {};
        },
        httpGet: (url) => {
          if (url.includes('/zones?')) return { result: [{ id: 'zone-1', name: 'igreja.com.br' }] };
          if (url.includes('/dns_records')) return { result: [] };
          return {};
        },
      });
      const state = stateFor(service, 't1');

      const redirect = await service.handleOAuthCallback('code', state);

      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=erro');
    });

    it('erro da Cloudflare ao atualizar registro DNS existente (PUT) é traduzido e redireciona com erro', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com.br' },
        httpPost: (url) =>
          url.includes('oauth2/token') ? { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } : {},
        httpPut: () => new Error('falha ao atualizar registro'),
        httpGet: (url) => {
          if (url.includes('/zones?')) return { result: [{ id: 'zone-1', name: 'igreja.com.br' }] };
          if (url.includes('/dns_records')) return { result: [{ id: 'rec-1' }] };
          return {};
        },
      });
      const state = stateFor(service, 't1');

      const redirect = await service.handleOAuthCallback('code', state);

      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=erro');
    });

    it('CLOUDFLARE_OAUTH_CLIENT_SECRET ausente na troca do código: erro traduzido, redireciona com erro', async () => {
      const { service, http } = harness({ branding: { custom_domain: 'doar.igreja.com.br' } });
      const state = stateFor(service, 't1');
      delete process.env['CLOUDFLARE_OAUTH_CLIENT_SECRET'];

      const redirect = await service.handleOAuthCallback('code', state);

      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=erro');
      expect(http.post).not.toHaveBeenCalled();
    });
  });

  describe('getValidCloudflareToken (privado — chamado por provisionViaCloudflare)', () => {
    it('sem conexão Cloudflare guardada, recusa', async () => {
      const { service } = harness();
      await expect(
        (service as unknown as { getValidCloudflareToken(t: string): Promise<string> }).getValidCloudflareToken(
          't1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('token perto de expirar é renovado via refresh_token antes de usar', async () => {
      process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'] = ENV_BASE.DOMAIN_SECRETS_ENCRYPTION_KEY;
      const cipher = new SecretCipher();
      const { service, branding, http } = harness({
        branding: {
          cloudflare_access_token_encrypted: cipher.encrypt('access-velho'),
          cloudflare_refresh_token_encrypted: cipher.encrypt('refresh-1'),
          cloudflare_token_expires_at: new Date(Date.now() - 1000),
        },
        httpPost: (url) =>
          url.includes('oauth2/token')
            ? { access_token: 'access-novo', refresh_token: 'refresh-novo', expires_in: 3600 }
            : {},
      });

      const token = await (
        service as unknown as { getValidCloudflareToken(t: string): Promise<string> }
      ).getValidCloudflareToken('t1');

      expect(token).toBe('access-novo');
      expect(http.post).toHaveBeenCalledWith(
        'https://dash.cloudflare.com/oauth2/token',
        expect.any(URLSearchParams),
        expect.anything(),
      );
      expect(branding.cloudflare_access_token_encrypted).not.toContain('access-novo');
    });
  });

  describe('ramos restantes — VERCEL_TEAM_ID, rejeição crua e verificação pendente', () => {
    it('com VERCEL_TEAM_ID configurado, as chamadas à Vercel carregam ?teamId=', async () => {
      process.env['VERCEL_TEAM_ID'] = 'team_x';
      const { service, http } = harness({
        branding: { custom_domain: 'doar.igreja.com' },
        httpGet: () => ({ verified: true }),
      });
      await service.requestManualVerification('t1');
      expect(http.post).toHaveBeenCalledWith(
        expect.stringContaining('?teamId=team_x'),
        expect.anything(),
        expect.anything(),
      );
      expect(http.get).toHaveBeenCalledWith(
        expect.stringContaining('?teamId=team_x'),
        expect.anything(),
      );
    });

    it('checkVercelVerification sem VERCEL_API_TOKEN/PROJECT_ID (chamada isolada) devolve false sem tentar a Vercel', async () => {
      delete process.env['VERCEL_API_TOKEN'];
      const { service, http } = harness();
      const verified = await (
        service as unknown as { checkVercelVerification(d: string): Promise<boolean> }
      ).checkVercelVerification('doar.igreja.com');
      expect(verified).toBe(false);
      expect(http.get).not.toHaveBeenCalled();
    });

    it('rejeição crua (não Error) na chamada à Vercel ainda é tratada como falha de verificação', async () => {
      const { service, http } = harness({ branding: { custom_domain: 'doar.igreja.com' } });
      // A rejeição crua (dependência mal comportada, sem lançar `Error`) não
      // passa pelo helper `asObservable` do harness — sobrescreve o mock
      // direto com `throwError` de valor não-Error.
      (http.get as jest.Mock).mockReturnValueOnce(throwError(() => 'string crua, não Error'));
      const status = await service.requestManualVerification('t1');
      expect(status.status).toBe('pending');
    });

    it('provisiona com sucesso mas a Vercel ainda não confirmou: fica pending, não vira erro', async () => {
      const { service, branding } = harness({
        branding: { custom_domain: 'doar.igreja.com.br' },
        httpPost: (url) =>
          url.includes('oauth2/token') ? { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } : {},
        httpGet: (url) => {
          if (url.includes('/zones?')) return { result: [{ id: 'zone-1', name: 'igreja.com.br' }] };
          if (url.includes('/dns_records')) return { result: [] };
          if (url.includes('vercel.com')) return { verified: false };
          return {};
        },
      });
      const state = service.buildAuthorizeUrl('t1').url.match(/state=([^&]+)/)![1]!;

      await service.handleOAuthCallback('code', decodeURIComponent(state));

      expect(branding.custom_domain_status).toBe('pending');
    });

    it('rejeição crua (não Error) de um cliente HTTP da Cloudflare também é tratada, sem quebrar o log', async () => {
      const { service, http } = harness({
        branding: { custom_domain: 'doar.igreja.com.br' },
        httpPost: (url) =>
          url.includes('oauth2/token') ? { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } : {},
      });
      (http.get as jest.Mock).mockReturnValueOnce(throwError(() => 'zona indisponível, sem Error'));
      const state = service.buildAuthorizeUrl('t1').url.match(/state=([^&]+)/)![1]!;

      const redirect = await service.handleOAuthCallback('code', decodeURIComponent(state));

      expect(redirect).toBe('https://web.useorbien.com/configuracoes?dominio=erro');
    });

    it('resolveTenantSlugByHost: domínio verified mas o tenant já não existe mais', async () => {
      const { service } = harness({
        branding: { custom_domain: 'doar.igreja.com', custom_domain_status: 'verified' },
        // sem tenantSlug — o mock de tenant.findUnique devolve null
      });
      await expect(service.resolveTenantSlugByHost('doar.igreja.com')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
