/**
 * O que este arquivo prende é uma armadilha, não uma função.
 *
 * O Prisma 6 devolve um Proxy do construtor, e é o proxy que resolve os
 * delegates de modelo. Num getter do protótipo o `this` é o alvo cru — tem
 * `$connect`, não tem `person`. Enquanto `get client()` devolvia `this`, todo
 * caminho sem transação ativa morria com "Cannot read properties of undefined",
 * e os dois caminhos públicos do produto ficaram mortos em produção sem
 * ninguém notar: as rotas autenticadas passam pelo interceptor e recebem o
 * `tx`, que tem os delegates, então nada mais quebrava junto.
 *
 * Por isso o teste é sobre o delegate existir, e não sobre consultar nada:
 * ele falha exatamente no cenário que passou meses despercebido.
 */

process.env['DATABASE_URL'] ??= 'postgresql://user:pass@localhost:5432/db';
process.env['DIRECT_URL'] ??= process.env['DATABASE_URL'];

import { PrismaService } from './prisma.service';

describe('PrismaService.client', () => {
  let service: PrismaService;

  beforeAll(() => {
    // Instanciar não conecta: o Prisma só abre socket no primeiro uso ou em
    // $connect(), então esta suíte continua sem precisar de banco.
    service = new PrismaService();
  });

  it('expõe os delegates de modelo quando não há transação ativa', () => {
    expect(typeof service.client.person).toBe('object');
    expect(typeof service.client.waitlistSubscriber).toBe('object');
    expect(typeof service.client.qrToken).toBe('object');
  });

  it('devolve o cliente da transação quando há uma ativa', async () => {
    const tx = { person: 'sou o tx' };

    await service.withTx(tx as never, () => {
      expect((service.client as unknown as { person: string }).person).toBe('sou o tx');
      return Promise.resolve();
    });
  });

  it('fora da transação volta a ser o cliente principal', () => {
    expect(typeof service.client.person).toBe('object');
  });
});

describe('PrismaService — ciclo de vida', () => {
  it('onModuleInit conecta o cliente principal e o `system`', async () => {
    const service = new PrismaService();
    const connect = jest.spyOn(service, '$connect').mockResolvedValue(undefined);
    const systemConnect = jest.spyOn(service.system, '$connect').mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalled();
    expect(systemConnect).toHaveBeenCalled();
  });

  it('onModuleDestroy desconecta o cliente principal e o `system`', async () => {
    const service = new PrismaService();
    const disconnect = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);
    const systemDisconnect = jest.spyOn(service.system, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalled();
    expect(systemDisconnect).toHaveBeenCalled();
  });
});

describe('PrismaService.runInTx', () => {
  it('reusa a transação ativa em vez de abrir outra, quando chamado de dentro de withTx', async () => {
    const service = new PrismaService();
    const outerTx = { person: 'sou o tx externo' } as never;
    const transactionSpy = jest.spyOn(service, '$transaction');

    const result = await service.withTx(outerTx, () =>
      service.runInTx(async (tx) => {
        expect(tx).toBe(outerTx);
        return 'ok';
      }),
    );

    expect(result).toBe('ok');
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('sem transação ativa, abre uma nova via $transaction', async () => {
    const service = new PrismaService();
    const fakeTx = { person: 'sou a nova tx' };
    const transactionSpy = jest
      .spyOn(service, '$transaction')
      .mockImplementation(((fn: (tx: unknown) => unknown, _opts?: unknown) =>
        Promise.resolve(fn(fakeTx))) as never);

    const result = await service.runInTx(async (tx) => {
      expect(tx).toBe(fakeTx);
      return 'novo';
    });

    expect(result).toBe('novo');
    expect(transactionSpy).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
      maxWait: 10_000,
    });
  });

  it('aceita timeout e maxWait customizados', async () => {
    const service = new PrismaService();
    const fakeTx = {};
    const transactionSpy = jest
      .spyOn(service, '$transaction')
      .mockImplementation(((fn: (tx: unknown) => unknown) => Promise.resolve(fn(fakeTx))) as never);

    await service.runInTx(async () => 'ok', { timeout: 5000, maxWait: 2000 });

    expect(transactionSpy).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 5000,
      maxWait: 2000,
    });
  });
});
