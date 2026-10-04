import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DomainProvisioningService } from './domain-provisioning.service';

/**
 * Rotas autenticadas do provisionamento de domínio próprio (Premium). O
 * callback do OAuth com a Cloudflare NÃO mora aqui — é rota pública, sem
 * Authorization header (o navegador chega vindo do redirect da Cloudflare),
 * ver `PublicDomainController`.
 */
@Controller('settings/branding/domain')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@Roles('tenant_admin')
@RequiresPlan('premium')
export class DomainProvisioningController {
  constructor(private readonly domainProvisioningService: DomainProvisioningService) {}

  @Get()
  getStatus(@CurrentUser() user: JwtPayload) {
    return this.domainProvisioningService.getStatus(user.tenant_id);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verifyManually(@CurrentUser() user: JwtPayload) {
    return this.domainProvisioningService.requestManualVerification(user.tenant_id);
  }

  @Get('cloudflare/authorize-url')
  getCloudflareAuthorizeUrl(@CurrentUser() user: JwtPayload) {
    return this.domainProvisioningService.buildAuthorizeUrl(user.tenant_id);
  }

  @Post('cloudflare/disconnect')
  @HttpCode(HttpStatus.OK)
  disconnectCloudflare(@CurrentUser() user: JwtPayload) {
    return this.domainProvisioningService.disconnectCloudflare(user.tenant_id);
  }
}
