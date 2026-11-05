/**
 * Rota sem autenticação — o que importa aqui, além da delegação normal, é o
 * limite de taxa (`@Throttle`, avaliado pelo `ThrottlerGuard` já no
 * `@UseGuards` do controller) e a validação de entrada, coberta à parte em
 * `dto/register-visitor.dto.spec.ts`.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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

  it('é protegida por ThrottlerGuard e tem teto de 300 por hora por IP (rede de segurança — PEND-18)', () => {
    const guards = Reflect.getMetadata('__guards__', VisitorPublicController) as unknown[];
    expect(guards).toContain(ThrottlerGuard);

    const reflector = new Reflector();
    const limit = reflector.get<number>('THROTTLER:LIMITdefault', VisitorPublicController.prototype.register);
    const ttl = reflector.get<number>('THROTTLER:TTLdefault', VisitorPublicController.prototype.register);
    expect(limit).toBe(300);
    expect(ttl).toBe(3600000);
  });

  it('describeQr delega ao service e tem limite próprio, maior que o do cadastro', async () => {
    const info = { church_name: 'Igreja de Teste 1', origin: 'service', label: null };
    const visitorService = {
      describeQr: jest.fn().mockResolvedValue(info),
    } as unknown as jest.Mocked<VisitorService>;
    const controller = new VisitorPublicController(visitorService);

    await expect(controller.describeQr('tok')).resolves.toEqual(info);
    expect(visitorService.describeQr).toHaveBeenCalledWith('tok');

    const reflector = new Reflector();
    expect(reflector.get<number>('THROTTLER:LIMITdefault', VisitorPublicController.prototype.describeQr)).toBe(120);
    expect(reflector.get<number>('THROTTLER:TTLdefault', VisitorPublicController.prototype.describeQr)).toBe(3600000);
  });

  it('dois tokens no mesmo IP se somam no teto de IP: o 301º envio recebe 429', async () => {
    const registerViaQr = jest.fn().mockResolvedValue({ status: 'registered', message: 'ok' });
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [VisitorPublicController],
      providers: [{ provide: VisitorService, useValue: { registerViaQr } }],
    }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
    try {
      const send = (token: string) =>
        request(app.getHttpServer())
          .post('/public/visitor/register')
          .send({ token, full_name: 'Ana', lgpd_consent: true, origin: 'service' });
      for (let i = 0; i < 300; i++) {
        const res = await send(i % 2 ? 'tok-a' : 'tok-b');
        expect(res.status).toBe(200);
      }
      expect((await send('tok-a')).status).toBe(429);
      expect((await send('tok-b')).status).toBe(429);
      expect(registerViaQr).toHaveBeenCalledTimes(300);
    } finally {
      await app.close();
    }
  });
});
