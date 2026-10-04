import { Reflector } from '@nestjs/core';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { PublicDonationThrottlerGuard } from './public-donation-throttler.guard';

function guard() {
  const storage = new ThrottlerStorageService();
  return new PublicDonationThrottlerGuard(
    [{ ttl: 60_000, limit: 100 }],
    storage,
    new Reflector(),
  );
}

// `getTracker` é protegido; o teste o chama como o `handleRequest` o faria.
const trackerOf = (req: Record<string, unknown>) =>
  (guard() as unknown as { getTracker: (r: Record<string, unknown>) => Promise<string> }).getTracker(req);

describe('PublicDonationThrottlerGuard', () => {
  it('POST: o balde é "<slug do corpo>:<ip>"', async () => {
    expect(await trackerOf({ ip: '10.0.0.1', body: { tenant_slug: 'igreja-a' }, params: {} })).toBe(
      'igreja-a:10.0.0.1',
    );
  });

  it('GET de status: o slug vem do caminho', async () => {
    expect(await trackerOf({ ip: '10.0.0.1', params: { tenant_slug: 'igreja-b' } })).toBe(
      'igreja-b:10.0.0.1',
    );
  });

  it('igrejas diferentes na mesma origem caem em baldes diferentes', async () => {
    const a = await trackerOf({ ip: '10.0.0.1', body: { tenant_slug: 'igreja-a' } });
    const b = await trackerOf({ ip: '10.0.0.1', body: { tenant_slug: 'igreja-b' } });

    expect(a).not.toBe(b);
  });

  it('a mesma igreja em origens diferentes também', async () => {
    const a = await trackerOf({ ip: '10.0.0.1', body: { tenant_slug: 'igreja-a' } });
    const b = await trackerOf({ ip: '10.0.0.2', body: { tenant_slug: 'igreja-a' } });

    expect(a).not.toBe(b);
  });

  it('sem slug (corpo vazio ou slug que não é texto): balde "sem-slug", não quebra', async () => {
    expect(await trackerOf({ ip: '10.0.0.1' })).toBe('sem-slug:10.0.0.1');
    expect(await trackerOf({ ip: '10.0.0.1', body: { tenant_slug: 123 } })).toBe('sem-slug:10.0.0.1');
    expect(await trackerOf({ ip: '10.0.0.1', body: { tenant_slug: '' } })).toBe('sem-slug:10.0.0.1');
  });

  it('slug gigante é cortado em 64 caracteres — não vira chave de memória ilimitada', async () => {
    const tracker = await trackerOf({ ip: '10.0.0.1', body: { tenant_slug: 'a'.repeat(5000) } });

    expect(tracker).toBe(`${'a'.repeat(64)}:10.0.0.1`);
  });

  it('o cabeçalho X-Forwarded-For forjado pelo cliente não entra no balde', async () => {
    const tracker = await trackerOf({
      ip: '10.0.0.1',
      headers: { 'x-forwarded-for': '1.2.3.4' },
      body: { tenant_slug: 'igreja-a' },
    });

    expect(tracker).toBe('igreja-a:10.0.0.1');
  });
});
