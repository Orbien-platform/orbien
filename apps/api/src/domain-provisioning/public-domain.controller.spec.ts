import { ServiceUnavailableException } from '@nestjs/common';
import { PublicDomainController } from './public-domain.controller';
import { DomainProvisioningService } from './domain-provisioning.service';

function harness() {
  const service = {
    resolveTenantSlugByHost: jest.fn(),
    handleOAuthCallback: jest.fn(),
  } as unknown as jest.Mocked<DomainProvisioningService>;
  const controller = new PublicDomainController(service);
  return { controller, service };
}

describe('PublicDomainController', () => {
  describe('resolve', () => {
    it('recusa sem host, sem chegar a chamar o service', () => {
      const { controller, service } = harness();
      expect(() => controller.resolve('')).toThrow(ServiceUnavailableException);
      expect(service.resolveTenantSlugByHost).not.toHaveBeenCalled();
    });

    it('normaliza o host para minúsculas antes de resolver', () => {
      const { controller, service } = harness();
      service.resolveTenantSlugByHost.mockResolvedValue({ tenant_slug: 'igreja-modelo' });

      const result = controller.resolve('Doar.Igreja.COM.BR');

      expect(service.resolveTenantSlugByHost).toHaveBeenCalledWith('doar.igreja.com.br');
      expect(result).resolves.toEqual({ tenant_slug: 'igreja-modelo' });
    });
  });

  describe('cloudflareCallback', () => {
    it('devolve a url do service pronta pro decorator @Redirect', async () => {
      const { controller, service } = harness();
      service.handleOAuthCallback.mockResolvedValue('https://web.useorbien.com/configuracoes?dominio=conectado');

      const result = await controller.cloudflareCallback('code-1', 'state-1');

      expect(service.handleOAuthCallback).toHaveBeenCalledWith('code-1', 'state-1');
      expect(result).toEqual({ url: 'https://web.useorbien.com/configuracoes?dominio=conectado' });
    });
  });
});
