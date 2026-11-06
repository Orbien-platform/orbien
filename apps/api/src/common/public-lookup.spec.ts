import { PrismaClient } from '@prisma/client';
import {
  findImpersonateTarget,
  findPublicDonationTarget,
  findPublicQrChurch,
  findPublicTenantBySlug,
  findTenantSlugByVerifiedHost,
} from './public-lookup';

/**
 * Finas sobre `$queryRaw`: o SQL em si (filtro exato, zero ou uma linha,
 * colunas devolvidas, EXECUTE só para orbien_app) é coberto em
 * `test/rls/public-lookup.spec.ts`. Aqui fica o contrato de TypeScript — uma
 * linha vira o objeto, nenhuma linha vira `null`, e o parâmetro vai ligado à
 * consulta, nunca concatenado.
 */
function clientReturning(rows: unknown[]) {
  const $queryRaw = jest.fn().mockResolvedValue(rows);
  return { client: { $queryRaw } as unknown as PrismaClient, $queryRaw };
}

describe('public-lookup', () => {
  it.each([
    ['findPublicTenantBySlug', findPublicTenantBySlug, 'igreja-a'],
    ['findPublicDonationTarget', findPublicDonationTarget, 'igreja-a'],
    ['findPublicQrChurch', findPublicQrChurch, 'tok-1'],
    ['findImpersonateTarget', findImpersonateTarget, 'tenant-1'],
  ] as const)('%s devolve a linha e liga o parâmetro', async (_nome, fn, arg) => {
    const row = { marca: 'x' };
    const { client, $queryRaw } = clientReturning([row]);

    await expect(fn(client, arg)).resolves.toBe(row);
    expect($queryRaw.mock.calls[0].slice(1)).toEqual([arg]);
  });

  it.each([
    ['findPublicTenantBySlug', findPublicTenantBySlug],
    ['findPublicDonationTarget', findPublicDonationTarget],
    ['findPublicQrChurch', findPublicQrChurch],
    ['findImpersonateTarget', findImpersonateTarget],
  ] as const)('%s devolve null quando a função não acha nada', async (_nome, fn) => {
    const { client } = clientReturning([]);
    await expect(fn(client, 'nada')).resolves.toBeNull();
  });

  describe('findTenantSlugByVerifiedHost', () => {
    it('devolve o slug do domínio verificado', async () => {
      const { client, $queryRaw } = clientReturning([{ slug: 'igreja-a' }]);
      await expect(findTenantSlugByVerifiedHost(client, 'doar.igreja.com')).resolves.toBe('igreja-a');
      expect($queryRaw.mock.calls[0].slice(1)).toEqual(['doar.igreja.com']);
    });

    it('devolve null quando o domínio não resolve (pendente ou desconhecido)', async () => {
      const { client } = clientReturning([{ slug: null }]);
      await expect(findTenantSlugByVerifiedHost(client, 'x.com')).resolves.toBeNull();
      const vazio = clientReturning([]);
      await expect(findTenantSlugByVerifiedHost(vazio.client, 'x.com')).resolves.toBeNull();
    });
  });
});
