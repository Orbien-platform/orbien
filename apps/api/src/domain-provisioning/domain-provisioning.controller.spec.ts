import { DomainProvisioningController } from './domain-provisioning.controller';
import { DomainProvisioningService } from './domain-provisioning.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 't1',
  congregation_id: 'c1',
  roles: ['tenant_admin'],
  plan: 'premium',
};

function harness() {
  const service = {
    getStatus: jest.fn(),
    requestManualVerification: jest.fn(),
    buildAuthorizeUrl: jest.fn(),
    disconnectCloudflare: jest.fn(),
  } as unknown as jest.Mocked<DomainProvisioningService>;
  const controller = new DomainProvisioningController(service);
  return { controller, service };
}

describe('DomainProvisioningController', () => {
  it('getStatus delega ao service com o tenant do token', async () => {
    const { controller, service } = harness();
    service.getStatus.mockResolvedValue({ custom_domain: 'a.com' } as never);

    const result = await controller.getStatus(user);

    expect(service.getStatus).toHaveBeenCalledWith('t1');
    expect(result).toEqual({ custom_domain: 'a.com' });
  });

  it('verifyManually delega ao service com o tenant do token', async () => {
    const { controller, service } = harness();
    service.requestManualVerification.mockResolvedValue({ status: 'verified' } as never);

    const result = await controller.verifyManually(user);

    expect(service.requestManualVerification).toHaveBeenCalledWith('t1');
    expect(result).toEqual({ status: 'verified' });
  });

  it('getCloudflareAuthorizeUrl delega ao service com o tenant do token', () => {
    const { controller, service } = harness();
    service.buildAuthorizeUrl.mockReturnValue({ url: 'https://dash.cloudflare.com/x' });

    const result = controller.getCloudflareAuthorizeUrl(user);

    expect(service.buildAuthorizeUrl).toHaveBeenCalledWith('t1');
    expect(result).toEqual({ url: 'https://dash.cloudflare.com/x' });
  });

  it('disconnectCloudflare delega ao service com o tenant do token', async () => {
    const { controller, service } = harness();
    service.disconnectCloudflare.mockResolvedValue({ cloudflare_connected: false } as never);

    const result = await controller.disconnectCloudflare(user);

    expect(service.disconnectCloudflare).toHaveBeenCalledWith('t1');
    expect(result).toEqual({ cloudflare_connected: false });
  });
});
