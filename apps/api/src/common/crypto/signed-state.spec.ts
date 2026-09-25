import { UnauthorizedException } from '@nestjs/common';
import { SignedState } from './signed-state';

const KEY = 'b'.repeat(64);

describe('SignedState', () => {
  beforeEach(() => {
    process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'] = KEY;
  });
  afterEach(() => {
    delete process.env['DOMAIN_SECRETS_ENCRYPTION_KEY'];
  });

  it('assina e verifica o tenant_id de volta', () => {
    const signedState = new SignedState();
    const state = signedState.sign('tenant-1');
    expect(signedState.verify(state).tenantId).toBe('tenant-1');
  });

  it('rejeita state com assinatura adulterada', () => {
    const signedState = new SignedState();
    const state = signedState.sign('tenant-1');
    const [payload] = state.split('.');
    const tampered = `${payload}.assinatura-forjada`;
    expect(() => signedState.verify(tampered)).toThrow(UnauthorizedException);
  });

  it('rejeita state trocando o tenant_id sem re-assinar', () => {
    const signedState = new SignedState();
    const state = signedState.sign('tenant-1');
    const [, signature] = state.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ tenant_id: 'tenant-2', exp: Date.now() + 60000 }), 'utf8').toString('base64url');
    expect(() => signedState.verify(`${forgedPayload}.${signature}`)).toThrow(UnauthorizedException);
  });

  it('rejeita state expirado', () => {
    const signedState = new SignedState();
    const originalNow = Date.now;
    Date.now = () => originalNow() - 20 * 60 * 1000;
    const state = signedState.sign('tenant-1');
    Date.now = originalNow;
    expect(() => signedState.verify(state)).toThrow(UnauthorizedException);
  });

  it('rejeita state sem o separador esperado', () => {
    const signedState = new SignedState();
    expect(() => signedState.verify('sem-ponto-nenhum')).toThrow(UnauthorizedException);
  });
});
