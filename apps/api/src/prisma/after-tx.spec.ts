import { afterTx, runWithAfterTx } from './after-tx';

describe('afterTx', () => {
  it('fora de uma requisição roda na hora', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    await afterTx(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('dentro de runWithAfterTx só roda DEPOIS que o corpo terminou, na ordem em que foi pedido', async () => {
    const order: string[] = [];
    await runWithAfterTx(async () => {
      await afterTx(async () => void order.push('a'));
      await afterTx(async () => void order.push('b'));
      order.push('corpo');
    });
    expect(order).toEqual(['corpo', 'a', 'b']);
  });

  it('roda também quando o corpo lança (o 403 desfaz a transação, o trabalho adiado segue) e repassa o erro', async () => {
    const fn = jest.fn().mockResolvedValue(undefined);
    const boom = new Error('403');
    await expect(
      runWithAfterTx(async () => {
        await afterTx(fn);
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('um trabalho adiado que falha não derruba a resposta nem os seguintes', async () => {
    const second = jest.fn().mockResolvedValue(undefined);
    await expect(
      runWithAfterTx(async () => {
        await afterTx(() => Promise.reject(new Error('db')));
        await afterTx(second);
        return 'ok';
      }),
    ).resolves.toBe('ok');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('o trabalho adiado já roda fora do contexto: um afterTx dentro dele executa na hora', async () => {
    const order: string[] = [];
    await runWithAfterTx(async () => {
      await afterTx(async () => {
        await afterTx(async () => void order.push('interno'));
        order.push('externo');
      });
    });
    expect(order).toEqual(['interno', 'externo']);
  });
});
