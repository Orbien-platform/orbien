import {
  Controller,
  Get,
  Query,
  Redirect,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { DomainProvisioningService } from './domain-provisioning.service';

/**
 * Rotas SEM login, mesmo espírito de `PublicSmallGroupsController`: nem
 * `JwtAuthGuard` nem `TenantContextInterceptor` — quem chega em
 * `.../callback` é o navegador do tenant, redirecionado pela Cloudflare
 * depois que ele aprovou o acesso, e não carrega Authorization header
 * nenhum. A autenticidade do pedido vem do `state` assinado (`SignedState`),
 * não de sessão.
 *
 * `.../resolve` é o que o middleware de host do `apps/web` chama a cada
 * requisição com domínio desconhecido — resolve o hostname para o
 * `tenant_slug` das rotas públicas já existentes (`/doar/[tenant_slug]`
 * etc.), só quando o domínio está `verified`.
 */
@Controller('public/domains')
@UseGuards(ThrottlerGuard)
export class PublicDomainController {
  constructor(private readonly domainProvisioningService: DomainProvisioningService) {}

  @Get('resolve')
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  resolve(@Query('host') host: string) {
    if (!host) throw new ServiceUnavailableException('host obrigatório');
    return this.domainProvisioningService.resolveTenantSlugByHost(host.toLowerCase());
  }

  @Get('cloudflare/callback')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Redirect()
  async cloudflareCallback(@Query('code') code: string, @Query('state') state: string) {
    const url = await this.domainProvisioningService.handleOAuthCallback(code, state);
    return { url };
  }
}
