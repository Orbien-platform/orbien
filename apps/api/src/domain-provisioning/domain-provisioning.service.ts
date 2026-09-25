import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { SecretCipher } from '../common/crypto/secret-cipher';
import { SignedState } from '../common/crypto/signed-state';

type CloudflareTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type CloudflareZone = { id: string; name: string };

type DomainStatus = {
  custom_domain: string | null;
  status: 'pending' | 'verified' | 'failed';
  cloudflare_connected: boolean;
  manual_instructions: ManualInstructions | null;
};

type ManualInstructions = {
  cname: { name: string; value: string };
  apex_alternative: { name: string; type: 'A'; value: string };
  note: string;
};

const VERCEL_CNAME_TARGET = 'cname.vercel-dns.com';
const VERCEL_APEX_A_RECORD = '76.76.21.21';

/**
 * Provisionamento de verdade do `custom_domain` que `PROD-19` só registrou
 * no banco (ver nota em `docs/PLANO.md`). Dois caminhos, os dois terminando
 * no mesmo lugar — registrar o domínio no projeto Vercel do `apps/web` —
 * porque é a Vercel quem emite o certificado depois que o DNS aponta certo,
 * em qualquer um dos dois casos:
 *
 * - **Manual**: só devolve os registros que o tenant tem que criar no
 *   provedor de DNS dele. Nenhuma credencial de terceiro entra no banco.
 * - **Cloudflare**: OAuth de verdade (`dash.cloudflare.com/oauth2`), sem
 *   tenant colar API token nenhum — clica em "Conectar com Cloudflare",
 *   aprova na própria Cloudflare, volta autenticado. O access/refresh token
 *   fica cifrado (`SecretCipher`) e é o que autoriza este serviço a criar o
 *   registro CNAME na zona certa em nome do tenant.
 */
@Injectable()
export class DomainProvisioningService {
  private readonly logger = new Logger(DomainProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
    private readonly cipher: SecretCipher,
    private readonly signedState: SignedState,
  ) {}

  // ── Configuração ────────────────────────────────────────────────────────

  private get cloudflareClientId(): string | undefined {
    return process.env['CLOUDFLARE_OAUTH_CLIENT_ID'];
  }

  private get cloudflareClientSecret(): string | undefined {
    return process.env['CLOUDFLARE_OAUTH_CLIENT_SECRET'];
  }

  private get cloudflareRedirectUri(): string | undefined {
    return process.env['CLOUDFLARE_OAUTH_REDIRECT_URI'];
  }

  // Escopos do app OAuth cadastrado em dash.cloudflare.com/oauth2 — os
  // nomes exatos são decididos no cadastro do app, não aqui; configurável
  // por env para não exigir deploy novo se a Cloudflare mudar o catálogo.
  // Precisa, no mínimo, de leitura de zona e escrita de registro DNS.
  private get cloudflareScopes(): string {
    return (
      process.env['CLOUDFLARE_OAUTH_SCOPES'] ??
      'zone:read dns_records:edit'
    );
  }

  private get vercelApiToken(): string | undefined {
    return process.env['VERCEL_API_TOKEN'];
  }

  private get vercelTeamId(): string | undefined {
    return process.env['VERCEL_TEAM_ID'];
  }

  private get vercelProjectId(): string | undefined {
    return process.env['VERCEL_WEB_PROJECT_ID'];
  }

  private get settingsPageUrl(): string {
    const base = process.env['FRONTEND_URL'] ?? 'https://web.useorbien.com';
    return `${base}/configuracoes`;
  }

  // ── Status e instruções manuais ─────────────────────────────────────────

  async getStatus(tenantId: string): Promise<DomainStatus> {
    const branding = await this.prisma.client.brandingConfig.findUnique({
      where: { tenant_id: tenantId },
      select: {
        custom_domain: true,
        custom_domain_status: true,
        cloudflare_access_token_encrypted: true,
      },
    });

    const status = (branding?.custom_domain_status ?? 'pending') as DomainStatus['status'];

    return {
      custom_domain: branding?.custom_domain ?? null,
      status,
      cloudflare_connected: Boolean(branding?.cloudflare_access_token_encrypted),
      manual_instructions: branding?.custom_domain
        ? this.buildManualInstructions(branding.custom_domain)
        : null,
    };
  }

  private buildManualInstructions(customDomain: string): ManualInstructions {
    return {
      cname: { name: customDomain, value: VERCEL_CNAME_TARGET },
      apex_alternative: { name: customDomain, type: 'A', value: VERCEL_APEX_A_RECORD },
      note:
        'Se o domínio tem um "." só antes do sufixo do país (domínio raiz, ex: suaigreja.com), ' +
        'alguns provedores de DNS não aceitam CNAME nesse nível — nesse caso use o registro A. ' +
        'Se for um subdomínio (ex: doar.suaigreja.com), use o CNAME.',
    };
  }

  // ── Caminho manual ──────────────────────────────────────────────────────

  async requestManualVerification(tenantId: string): Promise<DomainStatus> {
    const branding = await this.requireBranding(tenantId);
    await this.registerOnVercel(branding.custom_domain!);
    const verified = await this.checkVercelVerification(branding.custom_domain!);
    await this.prisma.client.brandingConfig.update({
      where: { tenant_id: tenantId },
      data: { custom_domain_status: verified ? 'verified' : 'pending' },
    });
    return this.getStatus(tenantId);
  }

  // ── Caminho Cloudflare (OAuth) ───────────────────────────────────────────

  buildAuthorizeUrl(tenantId: string): { url: string } {
    if (!this.cloudflareClientId || !this.cloudflareRedirectUri) {
      throw new ServiceUnavailableException(
        'Conexão com Cloudflare não configurada nesta instância — CLOUDFLARE_OAUTH_CLIENT_ID/CLOUDFLARE_OAUTH_REDIRECT_URI ausentes',
      );
    }

    const state = this.signedState.sign(tenantId);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.cloudflareClientId,
      redirect_uri: this.cloudflareRedirectUri,
      scope: this.cloudflareScopes,
      state,
    });
    return { url: `https://dash.cloudflare.com/oauth2/auth?${params.toString()}` };
  }

  /** Chamado pelo callback público — devolve pra onde redirecionar o navegador do tenant. */
  async handleOAuthCallback(code: string, state: string): Promise<string> {
    const { tenantId } = this.signedState.verify(state);

    try {
      const tokens = await this.exchangeCloudflareCode(code);
      await this.prisma.client.brandingConfig.update({
        where: { tenant_id: tenantId },
        data: {
          cloudflare_access_token_encrypted: this.cipher.encrypt(tokens.access_token),
          cloudflare_refresh_token_encrypted: this.cipher.encrypt(tokens.refresh_token),
          cloudflare_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
          cloudflare_connected_at: new Date(),
        },
      });

      await this.provisionViaCloudflare(tenantId);
      return `${this.settingsPageUrl}?dominio=conectado`;
    } catch (err) {
      this.logger.error('Falha ao conectar Cloudflare', err instanceof Error ? err.stack : err);
      return `${this.settingsPageUrl}?dominio=erro`;
    }
  }

  async disconnectCloudflare(tenantId: string): Promise<DomainStatus> {
    await this.prisma.client.brandingConfig.update({
      where: { tenant_id: tenantId },
      data: {
        cloudflare_access_token_encrypted: null,
        cloudflare_refresh_token_encrypted: null,
        cloudflare_token_expires_at: null,
        cloudflare_zone_id: null,
        cloudflare_connected_at: null,
      },
    });
    return this.getStatus(tenantId);
  }

  /** Cria/atualiza o registro DNS na Cloudflare e registra o domínio na Vercel. */
  private async provisionViaCloudflare(tenantId: string): Promise<void> {
    const branding = await this.requireBranding(tenantId);
    const customDomain = branding.custom_domain!;
    const accessToken = await this.getValidCloudflareToken(tenantId);

    const zone = await this.findZoneForDomain(accessToken, customDomain);
    if (!zone) {
      this.logger.warn(
        `Nenhuma zona Cloudflare encontrada para ${customDomain} (tenant ${tenantId})`,
      );
      return;
    }

    await this.upsertCloudflareCname(accessToken, zone.id, customDomain);
    await this.prisma.client.brandingConfig.update({
      where: { tenant_id: tenantId },
      data: { cloudflare_zone_id: zone.id },
    });

    await this.registerOnVercel(customDomain);
    const verified = await this.checkVercelVerification(customDomain);
    await this.prisma.client.brandingConfig.update({
      where: { tenant_id: tenantId },
      data: { custom_domain_status: verified ? 'verified' : 'pending' },
    });
  }

  private async getValidCloudflareToken(tenantId: string): Promise<string> {
    const branding = await this.prisma.client.brandingConfig.findUnique({
      where: { tenant_id: tenantId },
      select: {
        cloudflare_access_token_encrypted: true,
        cloudflare_refresh_token_encrypted: true,
        cloudflare_token_expires_at: true,
      },
    });
    if (!branding?.cloudflare_access_token_encrypted || !branding.cloudflare_refresh_token_encrypted) {
      throw new BadRequestException('Tenant não conectou a conta Cloudflare');
    }

    const expiresAt = branding.cloudflare_token_expires_at;
    const expiringSoon = !expiresAt || expiresAt.getTime() - Date.now() < 60_000;
    if (!expiringSoon) {
      return this.cipher.decrypt(branding.cloudflare_access_token_encrypted);
    }

    const refreshed = await this.refreshCloudflareToken(
      this.cipher.decrypt(branding.cloudflare_refresh_token_encrypted),
    );
    await this.prisma.client.brandingConfig.update({
      where: { tenant_id: tenantId },
      data: {
        cloudflare_access_token_encrypted: this.cipher.encrypt(refreshed.access_token),
        cloudflare_refresh_token_encrypted: this.cipher.encrypt(refreshed.refresh_token),
        cloudflare_token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000),
      },
    });
    return refreshed.access_token;
  }

  private async requireBranding(tenantId: string) {
    const branding = await this.prisma.client.brandingConfig.findUnique({
      where: { tenant_id: tenantId },
      select: { custom_domain: true },
    });
    if (!branding?.custom_domain) {
      throw new BadRequestException(
        'Cadastre o domínio em Configurações antes de provisionar (dto.branding.custom_domain)',
      );
    }
    return branding;
  }

  // ── Cliente HTTP — Cloudflare ────────────────────────────────────────────

  private async exchangeCloudflareCode(code: string): Promise<CloudflareTokenResponse> {
    return this.cloudflareTokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.cloudflareRedirectUri!,
    });
  }

  private async refreshCloudflareToken(refreshToken: string): Promise<CloudflareTokenResponse> {
    return this.cloudflareTokenRequest({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async cloudflareTokenRequest(
    extra: Record<string, string>,
  ): Promise<CloudflareTokenResponse> {
    if (!this.cloudflareClientId || !this.cloudflareClientSecret) {
      throw new ServiceUnavailableException('Credenciais OAuth da Cloudflare não configuradas');
    }
    try {
      const { data } = await firstValueFrom(
        this.http.post<CloudflareTokenResponse>(
          'https://dash.cloudflare.com/oauth2/token',
          new URLSearchParams({
            client_id: this.cloudflareClientId,
            client_secret: this.cloudflareClientSecret,
            ...extra,
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 },
        ),
      );
      return data;
    } catch (err) {
      throw this.translateHttpError(err, 'Cloudflare (token)');
    }
  }

  // Tenta o hostname inteiro e vai cortando o primeiro rótulo até achar uma
  // zona com esse nome exato na conta — evita precisar de uma lista de
  // sufixos públicos (com.br, etc.) para adivinhar onde termina o registro
  // e começa o TLD: quem responde isso é a própria Cloudflare.
  private async findZoneForDomain(
    accessToken: string,
    hostname: string,
  ): Promise<CloudflareZone | null> {
    const labels = hostname.split('.');
    for (let i = 0; i < labels.length - 1; i++) {
      const candidate = labels.slice(i).join('.');
      const zones = await this.cloudflareGet<{ result: CloudflareZone[] }>(
        accessToken,
        `/zones?name=${encodeURIComponent(candidate)}`,
      );
      if (zones.result.length > 0) return zones.result[0]!;
    }
    return null;
  }

  // proxied: false de propósito — com o proxy laranja ligado a Vercel não
  // enxerga o CNAME real e não consegue emitir/renovar o certificado do
  // domínio.
  private async upsertCloudflareCname(
    accessToken: string,
    zoneId: string,
    hostname: string,
  ): Promise<void> {
    const existing = await this.cloudflareGet<{ result: { id: string }[] }>(
      accessToken,
      `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(hostname)}`,
    );
    const body = { type: 'CNAME', name: hostname, content: VERCEL_CNAME_TARGET, ttl: 1, proxied: false };

    if (existing.result[0]) {
      await this.cloudflarePut(accessToken, `/zones/${zoneId}/dns_records/${existing.result[0].id}`, body);
    } else {
      await this.cloudflarePost(accessToken, `/zones/${zoneId}/dns_records`, body);
    }
  }

  private async cloudflareGet<T>(accessToken: string, path: string): Promise<T> {
    try {
      const { data } = await firstValueFrom(
        this.http.get<T>(`https://api.cloudflare.com/client/v4${path}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        }),
      );
      return data;
    } catch (err) {
      throw this.translateHttpError(err, 'Cloudflare');
    }
  }

  private async cloudflarePost<T>(accessToken: string, path: string, body: unknown): Promise<T> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<T>(`https://api.cloudflare.com/client/v4${path}`, body, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        }),
      );
      return data;
    } catch (err) {
      throw this.translateHttpError(err, 'Cloudflare');
    }
  }

  private async cloudflarePut<T>(accessToken: string, path: string, body: unknown): Promise<T> {
    try {
      const { data } = await firstValueFrom(
        this.http.put<T>(`https://api.cloudflare.com/client/v4${path}`, body, {
          headers: { Authorization: `Bearer ${accessToken}` },
          timeout: 10_000,
        }),
      );
      return data;
    } catch (err) {
      throw this.translateHttpError(err, 'Cloudflare');
    }
  }

  // ── Cliente HTTP — Vercel ────────────────────────────────────────────────

  private get vercelQuery(): string {
    return this.vercelTeamId ? `?teamId=${this.vercelTeamId}` : '';
  }

  private async registerOnVercel(domain: string): Promise<void> {
    if (!this.vercelApiToken || !this.vercelProjectId) {
      throw new ServiceUnavailableException(
        'VERCEL_API_TOKEN/VERCEL_WEB_PROJECT_ID ausentes — sem eles não há como registrar o domínio no projeto',
      );
    }
    try {
      await firstValueFrom(
        this.http.post(
          `https://api.vercel.com/v10/projects/${this.vercelProjectId}/domains${this.vercelQuery}`,
          { name: domain },
          { headers: { Authorization: `Bearer ${this.vercelApiToken}` }, timeout: 10_000 },
        ),
      );
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      // 409 = domínio já registrado no projeto (reconexão/retry) — não é falha.
      if (status !== 409) throw this.translateHttpError(err, 'Vercel');
    }
  }

  private async checkVercelVerification(domain: string): Promise<boolean> {
    if (!this.vercelApiToken || !this.vercelProjectId) return false;
    try {
      const { data } = await firstValueFrom(
        this.http.get<{ verified: boolean }>(
          `https://api.vercel.com/v9/projects/${this.vercelProjectId}/domains/${domain}${this.vercelQuery}`,
          { headers: { Authorization: `Bearer ${this.vercelApiToken}` }, timeout: 10_000 },
        ),
      );
      return data.verified === true;
    } catch (err) {
      const status = (err as AxiosError).response?.status;
      if (status === 404) throw new NotFoundException('Domínio não encontrado no projeto Vercel');
      // Só a stack, nunca o `err` inteiro: é um AxiosError, e `err.config.headers`
      // carrega o `Authorization: Bearer <VERCEL_API_TOKEN>` da própria chamada —
      // logar o objeto vazaria o token de plataforma em texto claro.
      this.logger.warn(
        `Falha ao checar verificação da Vercel para ${domain}`,
        err instanceof Error ? err.stack : err,
      );
      return false;
    }
  }

  private translateHttpError(err: unknown, provider: string): Error {
    this.logger.error(`Erro na chamada a ${provider}`, err instanceof Error ? err.stack : err);
    return new ServiceUnavailableException(`Serviço ${provider} indisponível`);
  }

  // ── Resolução pública por host (usada pelo middleware do apps/web) ──────

  async resolveTenantSlugByHost(host: string): Promise<{ tenant_slug: string }> {
    const branding = await this.prisma.client.brandingConfig.findFirst({
      where: { custom_domain: host, custom_domain_status: 'verified' },
      select: { tenant_id: true },
    });
    if (!branding) throw new NotFoundException('Domínio não reconhecido');

    const tenant = await this.prisma.client.tenant.findUnique({
      where: { id: branding.tenant_id },
      select: { slug: true },
    });
    if (!tenant) throw new NotFoundException('Domínio não reconhecido');

    return { tenant_slug: tenant.slug };
  }
}
