import { Reflector } from '@nestjs/core';
import { PixController } from './pix.controller';
import { PixService } from './pix.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { REQUIRES_PLAN_KEY } from '../auth/decorators/requires-plan.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

// Chaves de metadata do `@Throttle` (`throttler.constants`, não exportadas pelo pacote).
const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

const DYNAMIC_ROLES = ['admin_congregation', 'treasurer', 'tenant_admin'];

function requiredPlanFor(methodName: keyof PixController): string | undefined {
  const reflector = new Reflector();
  return reflector.get<string | undefined>(REQUIRES_PLAN_KEY, PixController.prototype[methodName]);
}

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['treasurer'],
  plan: 'starter',
};

function rolesFor(methodName: keyof PixController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, PixController.prototype[methodName]);
}

describe('PixController', () => {
  let pixService: jest.Mocked<PixService>;
  let controller: PixController;

  beforeEach(() => {
    pixService = {
      createManual: jest.fn(),
      createDynamic: jest.fn(),
      createSubscription: jest.fn(),
      listSubscriptions: jest.fn(),
      cancelSubscription: jest.fn(),
      createPublicDonation: jest.fn(),
      getPublicDonationStatus: jest.fn(),
      handleWebhook: jest.fn(),
    } as unknown as jest.Mocked<PixService>;

    controller = new PixController(pixService);
  });

  it('createManual (público) delega ao service', async () => {
    pixService.createManual.mockResolvedValue({ pix_key: 'k' } as never);

    const result = await controller.createManual({ tenant_slug: 'x' } as never);

    expect(pixService.createManual).toHaveBeenCalledWith({ tenant_slug: 'x' });
    expect(result).toEqual({ pix_key: 'k' });
  });

  it('createDynamic (autenticado) delega ao service e exige papel restrito', async () => {
    pixService.createDynamic.mockResolvedValue({ payment_id: 'p1' } as never);

    const result = await controller.createDynamic({ amount: 10 } as never, user);

    expect(pixService.createDynamic).toHaveBeenCalledWith({ amount: 10 }, user);
    expect(result).toEqual({ payment_id: 'p1' });
    expect(rolesFor('createDynamic')).toEqual(DYNAMIC_ROLES);
  });

  it('createSubscription (PIX recorrente) delega ao service, exige papel restrito e Premium', async () => {
    pixService.createSubscription.mockResolvedValue({ id: 'sub-1' } as never);

    const result = await controller.createSubscription(
      { donor_person_id: 'p1', amount: 50 } as never,
      user,
    );

    expect(pixService.createSubscription).toHaveBeenCalledWith(
      { donor_person_id: 'p1', amount: 50 },
      user,
    );
    expect(result).toEqual({ id: 'sub-1' });
    expect(rolesFor('createSubscription')).toEqual(DYNAMIC_ROLES);
    expect(requiredPlanFor('createSubscription')).toBe('premium');
  });

  it('listSubscriptions delega ao service, exige papel restrito e Premium', async () => {
    pixService.listSubscriptions.mockResolvedValue([{ id: 'sub-1' }] as never);

    const result = await controller.listSubscriptions(user);

    expect(pixService.listSubscriptions).toHaveBeenCalledWith(user);
    expect(result).toEqual([{ id: 'sub-1' }]);
    expect(rolesFor('listSubscriptions')).toEqual(DYNAMIC_ROLES);
    expect(requiredPlanFor('listSubscriptions')).toBe('premium');
  });

  it('cancelSubscription delega ao service, exige papel restrito e Premium', async () => {
    pixService.cancelSubscription.mockResolvedValue({ id: 'sub-1', status: 'cancelled' } as never);

    const result = await controller.cancelSubscription('sub-1', user);

    expect(pixService.cancelSubscription).toHaveBeenCalledWith('sub-1', user);
    expect(result).toEqual({ id: 'sub-1', status: 'cancelled' });
    expect(rolesFor('cancelSubscription')).toEqual(DYNAMIC_ROLES);
    expect(requiredPlanFor('cancelSubscription')).toBe('premium');
  });

  it('createPublicDonation (público) delega ao service', async () => {
    pixService.createPublicDonation.mockResolvedValue({ pix_key: 'k' } as never);

    const result = await controller.createPublicDonation({ tenant_slug: 'x' } as never);

    expect(pixService.createPublicDonation).toHaveBeenCalledWith({ tenant_slug: 'x' });
    expect(result).toEqual({ pix_key: 'k' });
  });

  it('getPublicDonationStatus (público) delega ao service com slug e payment_id', async () => {
    pixService.getPublicDonationStatus.mockResolvedValue({ status: 'pending' } as never);

    const result = await controller.getPublicDonationStatus(
      'igreja-x',
      '8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11',
    );

    expect(pixService.getPublicDonationStatus).toHaveBeenCalledWith(
      'igreja-x',
      '8c9f9a52-3b2e-4a40-9d63-6c6a2f0a1b11',
    );
    expect(result).toEqual({ status: 'pending' });
  });

  it('o status da doação pública nunca é cacheado e não exige papel nem plano', () => {
    const handler = PixController.prototype.getPublicDonationStatus;

    expect(Reflect.getMetadata('__headers__', handler)).toEqual([
      { name: 'Cache-Control', value: 'no-store' },
    ]);
    expect(rolesFor('getPublicDonationStatus')).toBeUndefined();
    expect(requiredPlanFor('getPublicDonationStatus')).toBeUndefined();
  });

  it('o polling tem limite mais folgado que a criação da doação pública', () => {
    const limite = (m: keyof PixController) =>
      Reflect.getMetadata(`${THROTTLER_LIMIT}default`, PixController.prototype[m]) as number;
    const ttl = (m: keyof PixController) =>
      Reflect.getMetadata(`${THROTTLER_TTL}default`, PixController.prototype[m]) as number;

    expect(limite('getPublicDonationStatus')).toBe(120);
    expect(ttl('getPublicDonationStatus')).toBe(60_000);
    expect(limite('getPublicDonationStatus')).toBeGreaterThan(limite('createPublicDonation'));
  });

  it('handleWebhook (público) delega ao service com body e token', async () => {
    pixService.handleWebhook.mockResolvedValue({ received: true } as never);

    const result = await controller.handleWebhook({ event: 'PAYMENT_CONFIRMED' }, 'token-123');

    expect(pixService.handleWebhook).toHaveBeenCalledWith(
      { event: 'PAYMENT_CONFIRMED' },
      'token-123',
    );
    expect(result).toEqual({ received: true });
  });

  it('handleWebhook aceita token ausente e repassa undefined', async () => {
    pixService.handleWebhook.mockResolvedValue({ received: true } as never);

    await controller.handleWebhook({}, undefined);

    expect(pixService.handleWebhook).toHaveBeenCalledWith({}, undefined);
  });
});
