/**
 * RLS — redes de células (PROD-20)
 *
 * `networks` é tabela NOVA, e o que este arquivo mede é que ela nasceu com a
 * policy certa: escopo de CONGREGAÇÃO (`016_rls_networks.sql`), não de
 * tenant. Sem o script, a tabela ficaria sem RLS e `app_user` — que tem
 * GRANT em tudo em `public` por ALTER DEFAULT PRIVILEGES — leria a lista de
 * redes de todas as igrejas.
 *
 * Duas congregações do MESMO tenant, de propósito: o caso que só o
 * isolamento por tenant deixaria passar. Uma terceira congregação de outro
 * tenant cobre o eixo de fora.
 *
 * `runAsUser`, e não `runAsTenantWithRole`: a policy segue o template de
 * `014_rls_small_group_visit_requests.sql` (per design.md), com
 * `app_current_user() IS NOT NULL` no USING/WITH CHECK — `app_current_user()`
 * resolve por `app.user_id`, que só `runAsUser` fixa. É exatamente o que
 * separa o produto autenticado de um plano público hipotético (não existe um
 * para `networks`, mas o predicado é o mesmo template).
 */

import { prismaAdmin, runAsTenantWithRole, runAsUser } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congBId: string;

let userA1Id: string;
let userBId: string;

let networkA1Id: string;
let networkA2Id: string;

beforeAll(async () => {
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `net-a-${ts}`, name: 'Tenant A (redes)' },
  });
  tenantAId = tenantA.id;
  congA1Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })
  ).id;
  congA2Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Filial' } })
  ).id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `net-b-${ts}`, name: 'Tenant B (redes)' },
  });
  tenantBId = tenantB.id;
  congBId = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } })
  ).id;

  userA1Id = (
    await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA1Id,
        email: `net-a1-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    })
  ).id;
  userBId = (
    await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantBId,
        congregation_id: congBId,
        email: `net-b-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    })
  ).id;

  networkA1Id = (
    await prismaAdmin.network.create({
      data: { tenant_id: tenantAId, congregation_id: congA1Id, name: 'Rede da Sede' },
    })
  ).id;
  networkA2Id = (
    await prismaAdmin.network.create({
      data: { tenant_id: tenantAId, congregation_id: congA2Id, name: 'Rede da Filial' },
    })
  ).id;
  await prismaAdmin.network.create({
    data: { tenant_id: tenantBId, congregation_id: congBId, name: 'Rede de Outro Tenant' },
  });
}, 60_000);

afterAll(async () => {
  await prismaAdmin.network.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.userAccount.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('networks — isolamento (PROD-20)', () => {
  it('a congregação vê a própria rede (controle positivo)', async () => {
    const row = await runAsUser(tenantAId, congA1Id, userA1Id, (tx) =>
      tx.network.findUnique({ where: { id: networkA1Id } }),
    );

    expect(row?.name).toBe('Rede da Sede');
  });

  it('a congregação IRMÃ, do mesmo tenant, não vê — é o caso que só tenant_id deixaria passar', async () => {
    const row = await runAsUser(tenantAId, congA1Id, userA1Id, (tx) =>
      tx.network.findUnique({ where: { id: networkA2Id } }),
    );

    expect(row).toBeNull();
  });

  it('listagem ampla só traz a congregação do contexto', async () => {
    const rows = await runAsUser(tenantAId, congA1Id, userA1Id, (tx) => tx.network.findMany());

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.congregation_id === congA1Id)).toBe(true);
  });

  it('o outro tenant não vê nada de A', async () => {
    const rows = await runAsUser(tenantBId, congBId, userBId, (tx) =>
      tx.network.findMany({ where: { tenant_id: tenantAId } }),
    );

    expect(rows).toHaveLength(0);
  });

  it('escrever rede na congregação alheia é negado — o WITH CHECK diz o mesmo que o USING', async () => {
    await expect(
      runAsUser(tenantAId, congA1Id, userA1Id, (tx) =>
        tx.network.create({
          data: { tenant_id: tenantAId, congregation_id: congA2Id, name: 'Intrusa' },
        }),
      ),
    ).rejects.toThrow();
  });

  it('apagar a rede da congregação irmã não atinge linha nenhuma', async () => {
    const { count } = await runAsUser(tenantAId, congA1Id, userA1Id, (tx) =>
      tx.network.deleteMany({ where: { id: networkA2Id } }),
    );

    expect(count).toBe(0);
  });

  it('sem contexto autenticado (sem app.user_id), a leitura não alcança rede nenhuma', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congA1Id, (tx) => tx.network.findMany());

    expect(rows).toHaveLength(0);
  });
});
