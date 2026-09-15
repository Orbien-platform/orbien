import { ThrottlerGuard } from '@nestjs/throttler';
import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  ProxyClientIpThrottlerGuard,
} from './proxy-client-ip-throttler.guard';

const SEGREDO = 'segredo-do-proxy';

type Tracker = { getTracker(req: unknown): Promise<string> };

// O guard só existe pelo `getTracker`; o resto do comportamento é do
// ThrottlerGuard do pacote. As dependências do construtor não são tocadas por
// esse método, então entram como dublês vazios.
function guard(): Tracker {
  return new ProxyClientIpThrottlerGuard(
    { throttlers: [] } as never,
    {} as never,
    {} as never,
  ) as unknown as Tracker;
}

function req(headers: Record<string, string | string[] | undefined>, ip = '200.0.0.1') {
  return { ip, headers };
}

describe('ProxyClientIpThrottlerGuard', () => {
  const ambiente = process.env['ORBIEN_PROXY_SECRET'];

  afterEach(() => {
    if (ambiente === undefined) delete process.env['ORBIEN_PROXY_SECRET'];
    else process.env['ORBIEN_PROXY_SECRET'] = ambiente;
  });

  it('é um ThrottlerGuard — o resto do comportamento continua sendo o do pacote', () => {
    expect(guard()).toBeInstanceOf(ThrottlerGuard);
  });

  describe('sem segredo configurado', () => {
    beforeEach(() => {
      delete process.env['ORBIEN_PROXY_SECRET'];
    });

    it('cai no req.ip, mesmo com os cabeçalhos presentes — é o comportamento de antes', async () => {
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: SEGREDO, [CLIENT_IP_HEADER]: '9.9.9.9' }),
      );
      expect(tracker).toBe('200.0.0.1');
    });

    it('devolve string vazia quando nem req.ip existe', async () => {
      const tracker = await guard().getTracker({ headers: {} });
      expect(tracker).toBe('');
    });
  });

  describe('com segredo configurado', () => {
    beforeEach(() => {
      process.env['ORBIEN_PROXY_SECRET'] = SEGREDO;
    });

    it('usa o IP declarado pelo proxy quando o segredo confere', async () => {
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: SEGREDO, [CLIENT_IP_HEADER]: '9.9.9.9' }),
      );
      expect(tracker).toBe('9.9.9.9');
    });

    it('aceita IPv6', async () => {
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: SEGREDO, [CLIENT_IP_HEADER]: '2001:db8::1' }),
      );
      expect(tracker).toBe('2001:db8::1');
    });

    it('tolera espaço em volta dos valores', async () => {
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: ` ${SEGREDO} `, [CLIENT_IP_HEADER]: '  9.9.9.9 ' }),
      );
      expect(tracker).toBe('9.9.9.9');
    });

    it('lê o primeiro valor quando o cabeçalho chega repetido', async () => {
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: [SEGREDO, 'outro'], [CLIENT_IP_HEADER]: ['9.9.9.9', '1.1.1.1'] }),
      );
      expect(tracker).toBe('9.9.9.9');
    });

    // As quatro abaixo são a razão de o guard existir com segredo: sem elas,
    // qualquer cliente chamando a API direto escolheria o próprio balde.
    it('ignora o IP quando não vem segredo nenhum', async () => {
      const tracker = await guard().getTracker(req({ [CLIENT_IP_HEADER]: '9.9.9.9' }));
      expect(tracker).toBe('200.0.0.1');
    });

    it('ignora o IP quando o segredo está errado — mesmo comprimento', async () => {
      const errado = 'x'.repeat(SEGREDO.length);
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: errado, [CLIENT_IP_HEADER]: '9.9.9.9' }),
      );
      expect(tracker).toBe('200.0.0.1');
    });

    it('ignora o IP quando o segredo está errado — comprimento diferente', async () => {
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: 'curto', [CLIENT_IP_HEADER]: '9.9.9.9' }),
      );
      expect(tracker).toBe('200.0.0.1');
    });

    it('ignora o segredo vazio', async () => {
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: '   ', [CLIENT_IP_HEADER]: '9.9.9.9' }),
      );
      expect(tracker).toBe('200.0.0.1');
    });

    it('cai no req.ip quando o proxy autenticado não manda IP', async () => {
      const tracker = await guard().getTracker(req({ [PROXY_SECRET_HEADER]: SEGREDO }));
      expect(tracker).toBe('200.0.0.1');
    });

    it('cai no req.ip quando o IP declarado não é um IP', async () => {
      const tracker = await guard().getTracker(
        req({ [PROXY_SECRET_HEADER]: SEGREDO, [CLIENT_IP_HEADER]: 'nao-e-ip' }),
      );
      expect(tracker).toBe('200.0.0.1');
    });

    it('não estoura quando a requisição chega sem headers', async () => {
      const tracker = await guard().getTracker({ ip: '200.0.0.1' });
      expect(tracker).toBe('200.0.0.1');
    });
  });
});
