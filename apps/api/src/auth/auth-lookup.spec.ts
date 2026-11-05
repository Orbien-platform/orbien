import { PrismaClient } from '@prisma/client';
import { findLoginByEmail, findSessionByUserId, findTenantAdminUserId } from './auth-lookup';

/**
 * As três funções são finas sobre `$queryRaw`: o SQL em si (filtro exato,
 * zero ou uma linha, EXECUTE só para orbien_app) é coberto em
 * `test/rls/auth-tables.spec.ts`. Aqui fica o contrato de TypeScript — uma
 * linha vira o objeto, nenhuma linha vira `null`.
 */
function clientReturning(rows: unknown[]) {
  const $queryRaw = jest.fn().mockResolvedValue(rows);
  return { client: { $queryRaw } as unknown as PrismaClient, $queryRaw };
}

describe('auth-lookup', () => {
  describe('findLoginByEmail', () => {
    it('devolve a linha quando a função acha a conta', async () => {
      const row = { user_id: 'u1', password_hash: 'h' };
      const { client, $queryRaw } = clientReturning([row]);

      await expect(findLoginByEmail(client, 'a@b.com')).resolves.toBe(row);
      // O e-mail vai como parâmetro da consulta, nunca concatenado.
      expect($queryRaw.mock.calls[0].slice(1)).toEqual(['a@b.com']);
    });

    it('devolve null quando não há conta', async () => {
      const { client } = clientReturning([]);
      await expect(findLoginByEmail(client, 'x@y.z')).resolves.toBeNull();
    });
  });

  describe('findSessionByUserId', () => {
    it('devolve a linha quando a função acha a conta', async () => {
      const row = { user_id: 'u1', is_active: true };
      const { client, $queryRaw } = clientReturning([row]);

      await expect(findSessionByUserId(client, 'u1')).resolves.toBe(row);
      expect($queryRaw.mock.calls[0].slice(1)).toEqual(['u1']);
    });

    it('devolve null quando não há conta', async () => {
      const { client } = clientReturning([]);
      await expect(findSessionByUserId(client, 'u1')).resolves.toBeNull();
    });
  });

  describe('findTenantAdminUserId', () => {
    it('devolve o id do admin do tenant', async () => {
      const { client, $queryRaw } = clientReturning([{ id: 'admin-1' }]);

      await expect(findTenantAdminUserId(client, 't1')).resolves.toBe('admin-1');
      expect($queryRaw.mock.calls[0].slice(1)).toEqual(['t1']);
    });

    it('devolve null quando o tenant não tem admin (a função devolve NULL)', async () => {
      const { client } = clientReturning([{ id: null }]);
      await expect(findTenantAdminUserId(client, 't1')).resolves.toBeNull();
    });

    it('devolve null quando a consulta não devolve linha', async () => {
      const { client } = clientReturning([]);
      await expect(findTenantAdminUserId(client, 't1')).resolves.toBeNull();
    });
  });
});
