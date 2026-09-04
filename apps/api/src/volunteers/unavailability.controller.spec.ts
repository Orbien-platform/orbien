import { Reflector } from '@nestjs/core';
import { UnavailabilityController } from './unavailability.controller';
import { UnavailabilityService } from './unavailability.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const USER: JwtPayload = {
  sub: 'u1',
  tenant_id: 't1',
  congregation_id: 'g1',
  roles: ['volunteer'],
  plan: 'premium',
};

const VOLUNTEER_ROLES = [
  'volunteer',
  'member',
  'ministry_leader',
  'pastor',
  'admin_congregation',
  'tenant_admin',
];
const LEADER_ROLES = ['ministry_leader', 'admin_congregation', 'tenant_admin'];

function rolesFor(methodName: keyof UnavailabilityController): string[] | undefined {
  const reflector = new Reflector();
  return reflector.get<string[] | undefined>(ROLES_KEY, UnavailabilityController.prototype[methodName]);
}

describe('UnavailabilityController', () => {
  let service: jest.Mocked<UnavailabilityService>;
  let controller: UnavailabilityController;

  beforeEach(() => {
    service = {
      upsert: jest.fn(),
      getMyUnavailability: jest.fn(),
      getMinistryAvailability: jest.fn(),
    } as unknown as jest.Mocked<UnavailabilityService>;

    controller = new UnavailabilityController(service);
  });

  it('upsert e getMyUnavailability aceitam qualquer voluntário', () => {
    expect(rolesFor('upsert')).toEqual(VOLUNTEER_ROLES);
    expect(rolesFor('getMyUnavailability')).toEqual(VOLUNTEER_ROLES);
  });

  it('getMinistryAvailability restringe a papéis de liderança', () => {
    expect(rolesFor('getMinistryAvailability')).toEqual(LEADER_ROLES);
  });

  it('upsert delega ao service com dados do usuário logado', async () => {
    service.upsert.mockResolvedValue({ id: 'unav-1' } as never);

    const result = await controller.upsert(
      { referenceMonth: 9, referenceYear: 2026, dates: ['2026-09-06'] } as never,
      USER,
    );

    expect(service.upsert).toHaveBeenCalledWith('u1', 't1', 'g1', {
      referenceMonth: 9,
      referenceYear: 2026,
      dates: ['2026-09-06'],
    });
    expect(result).toEqual({ id: 'unav-1' });
  });

  it('getMyUnavailability delega ao service', async () => {
    service.getMyUnavailability.mockResolvedValue({ id: 'unav-1' } as never);

    const result = await controller.getMyUnavailability({ month: 9, year: 2026 } as never, USER);

    expect(service.getMyUnavailability).toHaveBeenCalledWith('u1', 't1', 'g1', 9, 2026);
    expect(result).toEqual({ id: 'unav-1' });
  });

  it('getMinistryAvailability delega ao service com roles do usuário', async () => {
    service.getMinistryAvailability.mockResolvedValue([]);

    const result = await controller.getMinistryAvailability(
      'm1',
      { date: '2026-09-06' } as never,
      { ...USER, roles: ['ministry_leader'] },
    );

    expect(service.getMinistryAvailability).toHaveBeenCalledWith(
      'u1',
      ['ministry_leader'],
      't1',
      'g1',
      'm1',
      '2026-09-06',
    );
    expect(result).toEqual([]);
  });
});
