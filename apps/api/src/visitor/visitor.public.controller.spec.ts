/**
 * Rota sem autenticação — o que importa aqui, além da delegação normal, é o
 * limite de taxa (`@Throttle`, avaliado pelo `ThrottlerGuard` já no
 * `@UseGuards` do controller) e a validação de entrada, coberta à parte em
 * `dto/register-visitor.dto.spec.ts`.
 */
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { VisitorPublicController } from './visitor.public.controller';
import { VisitorService } from './visitor.service';

describe('VisitorPublicController', () => {
  it('register delega ao service com ip e user-agent da requisição', async () => {
    const visitorService = {
      registerViaQr: jest.fn().mockResolvedValue({ status: 'registered', message: 'ok' }),
    } as unknown as jest.Mocked<VisitorService>;
    const controller = new VisitorPublicController(visitorService);
    const dto = { token: 'tok', full_name: 'Ana', lgpd_consent: true } as never;
    const req = { ip: '1.2.3.4', headers: { 'user-agent': 'ua-test' } } as never;

    const result = await controller.register(dto, req);

    expect(visitorService.registerViaQr).toHaveBeenCalledWith(dto, '1.2.3.4', 'ua-test');
    expect(result).toEqual({ status: 'registered', message: 'ok' });
  });

  it('é protegida por ThrottlerGuard e limita a 20 chamadas por hora', () => {
    const guards = Reflect.getMetadata('__guards__', VisitorPublicController) as unknown[];
    expect(guards).toContain(ThrottlerGuard);

    const reflector = new Reflector();
    const limit = reflector.get<number>('THROTTLER:LIMITdefault', VisitorPublicController.prototype.register);
    const ttl = reflector.get<number>('THROTTLER:TTLdefault', VisitorPublicController.prototype.register);
    expect(limit).toBe(20);
    expect(ttl).toBe(3600000);
  });
});
