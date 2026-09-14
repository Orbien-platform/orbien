import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PublicSmallGroupsController } from './public-small-groups.controller';
import { PublicSmallGroupsService } from './public-small-groups.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

// As chaves são as mesmas de `visitor.public.controller.spec.ts`: o
// `@Throttle({ default: ... })` grava `THROTTLER:LIMITdefault` e
// `THROTTLER:TTLdefault` no handler.
function throttleFor(methodName: keyof PublicSmallGroupsController) {
  const reflector = new Reflector();
  const handler = PublicSmallGroupsController.prototype[methodName];
  return {
    limit: reflector.get<number>('THROTTLER:LIMITdefault', handler),
    ttl: reflector.get<number>('THROTTLER:TTLdefault', handler),
  };
}

describe('PublicSmallGroupsController', () => {
  let service: jest.Mocked<PublicSmallGroupsService>;
  let controller: PublicSmallGroupsController;

  beforeEach(() => {
    service = {
      findPublic: jest.fn(),
      requestVisit: jest.fn(),
    } as unknown as jest.Mocked<PublicSmallGroupsService>;

    controller = new PublicSmallGroupsController(service);
  });

  it('não declara @Roles em nenhuma rota — é o plano público, não há papel para exigir', () => {
    const reflector = new Reflector();
    for (const method of ['findPublic', 'requestVisit'] as const) {
      expect(
        reflector.get(ROLES_KEY, PublicSmallGroupsController.prototype[method]),
      ).toBeUndefined();
    }
  });

  it('é protegida por ThrottlerGuard, e o POST é bem mais apertado que o GET', () => {
    const guards = Reflect.getMetadata('__guards__', PublicSmallGroupsController) as unknown[];
    expect(guards).toContain(ThrottlerGuard);

    const list = throttleFor('findPublic');
    const post = throttleFor('requestVisit');

    expect(list).toEqual({ limit: 60, ttl: 60000 });
    expect(post).toEqual({ limit: 5, ttl: 3600000 });
    expect(post.limit / post.ttl).toBeLessThan(list.limit / list.ttl);
  });

  it('findPublic delega ao service', async () => {
    service.findPublic.mockResolvedValue({ church_name: 'Igreja', groups: [] });

    const result = await controller.findPublic({ tenant_slug: 'central' });

    expect(service.findPublic).toHaveBeenCalledWith({ tenant_slug: 'central' });
    expect(result).toEqual({ church_name: 'Igreja', groups: [] });
  });

  it('requestVisit delega ao service com o id da rota', async () => {
    service.requestVisit.mockResolvedValue({ status: 'received', message: 'ok' });

    const dto = { tenant_slug: 'central', visitor_name: 'Maria', visitor_phone: '11999990000' };
    const result = await controller.requestVisit('sg1', dto);

    expect(service.requestVisit).toHaveBeenCalledWith('sg1', dto);
    expect(result).toEqual({ status: 'received', message: 'ok' });
  });
});
