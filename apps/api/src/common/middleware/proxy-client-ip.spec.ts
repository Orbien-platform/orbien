import type { Request, Response } from 'express';
import { CLIENT_IP_HEADER, PROXY_AUTH_HEADER, proxyClientIp } from './proxy-client-ip';

function run(secret: string | undefined, headers: Record<string, string>, ip = '10.0.0.1') {
  const req = { ip, headers: { ...headers } } as unknown as Request;
  const next = jest.fn();
  proxyClientIp(secret)(req, {} as Response, next);
  return { req, next };
}

describe('proxyClientIp', () => {
  const ok = { [PROXY_AUTH_HEADER]: 's3cret', [CLIENT_IP_HEADER]: '203.0.113.9' };

  it('segredo certo + IP válido: req.ip vira o IP do cliente', () => {
    const { req, next } = run('s3cret', ok);
    expect(req.ip).toBe('203.0.113.9');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('aceita IPv6', () => {
    const { req } = run('s3cret', { ...ok, [CLIENT_IP_HEADER]: '2001:db8::1' });
    expect(req.ip).toBe('2001:db8::1');
  });

  it('segredo errado: ignora o cabeçalho (forjar o IP não funciona)', () => {
    expect(run('s3cret', { ...ok, [PROXY_AUTH_HEADER]: 'outro' }).req.ip).toBe('10.0.0.1');
    expect(run('s3cret', { ...ok, [PROXY_AUTH_HEADER]: 's3cretX' }).req.ip).toBe('10.0.0.1');
  });

  it('sem o cabeçalho de segredo, com IP forjado: ignora', () => {
    expect(run('s3cret', { [CLIENT_IP_HEADER]: '203.0.113.9' }).req.ip).toBe('10.0.0.1');
  });

  it('IP inválido com segredo certo: ignora', () => {
    expect(run('s3cret', { ...ok, [CLIENT_IP_HEADER]: 'nao-e-ip' }).req.ip).toBe('10.0.0.1');
  });

  it('sem ORBIEN_PROXY_SECRET configurado, nunca confia (falha fechada)', () => {
    expect(run(undefined, ok).req.ip).toBe('10.0.0.1');
    expect(run('', ok).req.ip).toBe('10.0.0.1');
  });

  it('remove os dois cabeçalhos em todos os casos', () => {
    for (const secret of ['s3cret', undefined]) {
      const { req } = run(secret, ok);
      expect(req.headers[PROXY_AUTH_HEADER]).toBeUndefined();
      expect(req.headers[CLIENT_IP_HEADER]).toBeUndefined();
    }
  });
});
