import { Reflector } from '@nestjs/core';
import { CelebrationSwapController } from './celebration-swap.controller';
import { CelebrationSwapService } from './celebration-swap.service';
import { VOLUNTEER_ROLES } from './celebration-volunteer.controller';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['volunteer'],
  plan: 'premium',
};

describe('CelebrationSwapController', () => {
  const service = {
    getCandidates: jest.fn().mockResolvedValue([]),
    createRequest: jest.fn().mockResolvedValue({ id: 'req-1' }),
    listMine: jest.fn().mockResolvedValue({ incoming: [], outgoing: [] }),
    accept: jest.fn().mockResolvedValue({ id: 'req-1' }),
    decline: jest.fn().mockResolvedValue({ id: 'req-1' }),
    cancel: jest.fn().mockResolvedValue({ id: 'req-1' }),
  } as unknown as jest.Mocked<CelebrationSwapService>;
  const controller = new CelebrationSwapController(service);
  const reflector = new Reflector();
  const ctx = ['user-1', 'tenant-1', 'cong-1'];

  it.each([
    ['candidates', () => controller.candidates('asg-1', user), 'getCandidates', ['asg-1', ...ctx]],
    [
      'request',
      () => controller.request('asg-1', { message: 'oi' }, user),
      'createRequest',
      ['asg-1', { message: 'oi' }, ...ctx],
    ],
    ['mine', () => controller.mine(user), 'listMine', ctx],
    ['accept', () => controller.accept('req-1', user), 'accept', ['req-1', ...ctx]],
    ['decline', () => controller.decline('req-1', user), 'decline', ['req-1', ...ctx]],
    ['cancel', () => controller.cancel('req-1', user), 'cancel', ['req-1', ...ctx]],
  ] as const)('%s delega ao service com o contexto do token', async (handler, call, method, args) => {
    await call();
    expect(service[method]).toHaveBeenCalledWith(...args);
    const roles = reflector.get<string[]>(
      ROLES_KEY,
      CelebrationSwapController.prototype[handler as keyof CelebrationSwapController] as unknown as () => void,
    );
    expect(roles).toEqual(VOLUNTEER_ROLES);
  });
});
