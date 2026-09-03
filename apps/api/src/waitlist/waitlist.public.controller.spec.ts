/**
 * Rota sem autenticação — além da delegação, o que importa é o limite de taxa
 * (`@Throttle`, avaliado pelo `ThrottlerGuard` do `@UseGuards` do controller)
 * e a validação de entrada, coberta à parte em `dto/create-waitlist.dto.spec.ts`.
 */
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { WaitlistPublicController } from './waitlist.public.controller';
import { WaitlistService } from './waitlist.service';

describe('WaitlistPublicController', () => {
  it('subscribe delega ao service com ip e user-agent, usando string vazia como fallback', async () => {
    const waitlistService = {
      subscribe: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as jest.Mocked<WaitlistService>;
    const controller = new WaitlistPublicController(waitlistService);
    const dto = { email: 'a@b.com' } as never;

    const withHeaders = { ip: '1.2.3.4', headers: { 'user-agent': 'ua-test' } } as never;
    await controller.subscribe(dto, withHeaders);
    expect(waitlistService.subscribe).toHaveBeenCalledWith(dto, '1.2.3.4', 'ua-test');

    const withoutHeaders = { ip: undefined, headers: {} } as never;
    await controller.subscribe(dto, withoutHeaders);
    expect(waitlistService.subscribe).toHaveBeenCalledWith(dto, '', '');
  });

  it('é protegida por ThrottlerGuard e limita a 5 chamadas por hora', () => {
    const guards = Reflect.getMetadata('__guards__', WaitlistPublicController) as unknown[];
    expect(guards).toContain(ThrottlerGuard);

    const reflector = new Reflector();
    const limit = reflector.get<number>('THROTTLER:LIMITdefault', WaitlistPublicController.prototype.subscribe);
    const ttl = reflector.get<number>('THROTTLER:TTLdefault', WaitlistPublicController.prototype.subscribe);
    expect(limit).toBe(5);
    expect(ttl).toBe(3600000);
  });
});
