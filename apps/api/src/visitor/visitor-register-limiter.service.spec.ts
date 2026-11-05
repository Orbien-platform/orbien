import { HttpException, NotFoundException } from '@nestjs/common';
import {
  MAX_INVALID_TOKENS_PER_IP,
  MAX_REGISTERS_PER_TOKEN,
  REGISTER_WINDOW_MS,
  VisitorRegisterLimiter,
} from './visitor-register-limiter.service';
import { VisitorService } from './visitor.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClassificationService } from '../persons/classification.service';
import { VisitsService } from '../persons/visits.service';

const status = (fn: () => void): number | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as HttpException).getStatus();
  }
  return undefined;
};

describe('VisitorRegisterLimiter (PEND-18)', () => {
  afterEach(() => jest.useRealTimers());

  it('o 21º cadastro do mesmo IP com o mesmo token passa dentro do teto do token', () => {
    const l = new VisitorRegisterLimiter();
    for (let i = 0; i < 25; i++) expect(status(() => l.hitToken('qr1'))).toBeUndefined();
  });

  it('excedido o teto do token, devolve 429; outro token não é afetado', () => {
    const l = new VisitorRegisterLimiter();
    for (let i = 0; i < MAX_REGISTERS_PER_TOKEN; i++) l.hitToken('qr1');
    expect(status(() => l.hitToken('qr1'))).toBe(429);
    expect(status(() => l.hitToken('qr2'))).toBeUndefined();
  });

  it('a janela recomeça depois de uma hora', () => {
    jest.useFakeTimers();
    const l = new VisitorRegisterLimiter();
    for (let i = 0; i <= MAX_REGISTERS_PER_TOKEN; i++) status(() => l.hitToken('qr1'));
    expect(status(() => l.hitToken('qr1'))).toBe(429);
    jest.advanceTimersByTime(REGISTER_WINDOW_MS + 1);
    expect(status(() => l.hitToken('qr1'))).toBeUndefined();
  });

  it('token inválido conta contra o IP e bloqueia só esse IP', () => {
    const l = new VisitorRegisterLimiter();
    for (let i = 0; i < MAX_INVALID_TOKENS_PER_IP; i++) {
      expect(status(() => l.assertIpNotBlocked('9.9.9.9'))).toBeUndefined();
      l.recordInvalid('9.9.9.9');
    }
    expect(status(() => l.assertIpNotBlocked('9.9.9.9'))).toBe(429);
    expect(status(() => l.assertIpNotBlocked('8.8.8.8'))).toBeUndefined();
  });

  it('IP sem identificação usa um balde comum e a janela do bloqueio expira', () => {
    jest.useFakeTimers();
    const l = new VisitorRegisterLimiter();
    for (let i = 0; i < MAX_INVALID_TOKENS_PER_IP; i++) l.recordInvalid(undefined);
    expect(status(() => l.assertIpNotBlocked(undefined))).toBe(429);
    jest.advanceTimersByTime(REGISTER_WINDOW_MS + 1);
    expect(status(() => l.assertIpNotBlocked(undefined))).toBeUndefined();
  });

  it('mapa cheio: varre o vencido e, sem vencidos, descarta o mais antigo', () => {
    jest.useFakeTimers();
    const l = new VisitorRegisterLimiter();
    for (let i = 0; i < 10_000; i++) l.hitToken(`t${i}`);
    jest.advanceTimersByTime(REGISTER_WINDOW_MS + 1);
    l.hitToken('novo'); // varre os 10 000 vencidos
    for (let i = 0; i < 10_000; i++) l.hitToken(`u${i}`); // enche de novo, sem vencidos
    expect(status(() => l.hitToken('outro'))).toBeUndefined(); // descarta o mais antigo
  });
});

describe('VisitorService.registerViaQr — limites do autocadastro (PEND-18)', () => {
  function setup() {
    const qrToken = { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      person: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'p', full_name: 'Ana' }) },
      consentRecord: { create: jest.fn().mockResolvedValue({}) },
      visitRecord: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      client: { qrToken },
      runInTx: jest.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const limiter = new VisitorRegisterLimiter();
    const service = new VisitorService(
      prisma,
      { checkAutoReclassification: jest.fn().mockResolvedValue(false) } as unknown as ClassificationService,
      {} as VisitsService,
      limiter,
    );
    return { service, qrToken, limiter };
  }
  const dto = (token: string) => ({ token, full_name: 'Ana', lgpd_consent: true }) as never;

  it('token inexistente não cria contador por token e cai no limite por IP', async () => {
    const { service, qrToken, limiter } = setup();
    qrToken.findUnique.mockResolvedValue(null);
    const hit = jest.spyOn(limiter, 'hitToken');

    for (let i = 0; i < MAX_INVALID_TOKENS_PER_IP; i++) {
      await expect(service.registerViaQr(dto(`chute-${i}`), '1.1.1.1', 'ua')).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(hit).not.toHaveBeenCalled();
    expect((limiter as unknown as { perToken: Map<string, unknown> }).perToken.size).toBe(0);

    // o 21º chute é barrado antes de consultar o banco
    qrToken.findUnique.mockClear();
    await expect(service.registerViaQr(dto('chute-x'), '1.1.1.1', 'ua')).rejects.toMatchObject({ status: 429 });
    expect(qrToken.findUnique).not.toHaveBeenCalled();
  });

  it('IP que errou token continua barrado mesmo com token válido; visitante legítimo em outro IP passa', async () => {
    const { service, qrToken } = setup();
    qrToken.findUnique.mockResolvedValue(null);
    for (let i = 0; i < MAX_INVALID_TOKENS_PER_IP; i++) await service.registerViaQr(dto('x'), '1.1.1.1', 'ua').catch(() => undefined);
    qrToken.findUnique.mockResolvedValue({ id: 'qr1', is_active: true, tenant_id: 't', congregation_id: 'c', origin: 'service', congregation: { name: 'I' } });
    await expect(service.registerViaQr(dto('ok'), '1.1.1.1', 'ua')).rejects.toMatchObject({ status: 429 });
    await expect(service.registerViaQr(dto('ok'), '2.2.2.2', 'ua')).resolves.toBeDefined();
  });

  it('token válido: 21 cadastros do mesmo IP passam; o que excede o teto do token recebe 429', async () => {
    const { service, qrToken } = setup();
    qrToken.findUnique.mockResolvedValue({ id: 'qr1', is_active: true, tenant_id: 't', congregation_id: 'c', origin: 'service', congregation: { name: 'I' } });
    for (let i = 0; i < MAX_REGISTERS_PER_TOKEN; i++) {
      await service.registerViaQr(dto('ok'), '1.1.1.1', 'ua');
    }
    await expect(service.registerViaQr(dto('ok'), '3.3.3.3', 'ua')).rejects.toMatchObject({ status: 429 });
  });
});
