/**
 * RLS — `pix_payments` (001_rls_setup.sql + passo 4 do bootstrap)
 *
 * A doação pública grava aqui sem JWT: `PixService.runInPublicContext` fixa
 * `app.tenant_id` e `app.congregation_id` do slug resolvido no servidor e a
 * policy `tenant_congregation_isolation` é a fronteira. Até esta suíte, só
 * `isolation.spec.ts` tocava a tabela, e só no eixo de tenant.
 *
 * Duas congregações do MESMO tenant (`teste1-church` + uma congregação extra
 * criada aqui) é o caso que o isolamento só por tenant deixaria passar; o
 * `teste2-church` cobre o eixo de fora. `docs/AMBIENTES.md`: só tenants de
 * teste.
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';
import { loadTestTenant, TestTenant } from '../helpers/test-tenants';

const ts = Date.now();

let t1: TestTenant;
let t2: TestTenant;
let extraCongregationId: string;
let extraCategoryId: string;
let rowT1Id: string;
let rowExtraId: string;
let rowT2Id: string;

function intent(tenant: { tenantId: string; congregationId: string; categoryId: string }, tag: string) {
  return {
    tenant_id: tenant.tenantId,
    congregation_id: tenant.congregationId,
    scenario: 'public' as const,
    status: 'pending' as const,
    amount: '12.00',
    pix_key: `chave-${tag}-${ts}`,
    category_id: tenant.categoryId,
  };
}

beforeAll(async () => {
  t1 = await loadTestTenant(prismaAdmin, 'teste1-church');
  t2 = await loadTestTenant(prismaAdmin, 'teste2-church');

  extraCongregationId = (
    await prismaAdmin.congregation.create({
      data: { tenant_id: t1.tenantId, name: `RLS pix_payments ${ts}` },
    })
  ).id;
  extraCategoryId = (
    await prismaAdmin.financialCategory.create({
      data: {
        tenant_id: t1.tenantId,
        congregation_id: extraCongregationId,
        name: 'Oferta',
        type: 'income',
      },
    })
  ).id;

  rowT1Id = (
    await prismaAdmin.pixPayment.create({
      data: intent({ ...t1, categoryId: t1.ofertaCategoryId }, 't1'),
    })
  ).id;
  rowExtraId = (
    await prismaAdmin.pixPayment.create({
      data: intent(
        { tenantId: t1.tenantId, congregationId: extraCongregationId, categoryId: extraCategoryId },
        'extra',
      ),
    })
  ).id;
  rowT2Id = (
    await prismaAdmin.pixPayment.create({
      data: intent({ ...t2, categoryId: t2.ofertaCategoryId }, 't2'),
    })
  ).id;
}, 60_000);

afterAll(async () => {
  await prismaAdmin.pixPayment.deleteMany({ where: { id: { in: [rowT1Id, rowExtraId, rowT2Id] } } });
  await prismaAdmin.financialCategory.deleteMany({ where: { id: extraCategoryId } });
  await prismaAdmin.congregation.deleteMany({ where: { id: extraCongregationId } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('pix_payments — isolamento por tenant e congregação', () => {
  it('a congregação vê a própria intenção (controle positivo)', async () => {
    const row = await runAsTenantWithRole(t1.tenantId, t1.congregationId, (tx) =>
      tx.pixPayment.findUnique({ where: { id: rowT1Id } }),
    );

    expect(row?.id).toBe(rowT1Id);
  });

  it('a congregação irmã, do mesmo tenant, não vê — o caso que só tenant_id deixaria passar', async () => {
    const row = await runAsTenantWithRole(t1.tenantId, t1.congregationId, (tx) =>
      tx.pixPayment.findUnique({ where: { id: rowExtraId } }),
    );

    expect(row).toBeNull();
  });

  it('o outro tenant não vê nada de teste1-church', async () => {
    const rows = await runAsTenantWithRole(t2.tenantId, t2.congregationId, (tx) =>
      tx.pixPayment.findMany({ where: { id: { in: [rowT1Id, rowExtraId] } } }),
    );

    expect(rows).toHaveLength(0);
  });

  it('gravar na congregação alheia é negado — o WITH CHECK diz o mesmo que o USING', async () => {
    await expect(
      runAsTenantWithRole(t1.tenantId, t1.congregationId, (tx) =>
        tx.pixPayment.create({
          data: intent(
            { tenantId: t1.tenantId, congregationId: extraCongregationId, categoryId: extraCategoryId },
            'intrusa',
          ),
        }),
      ),
    ).rejects.toThrow();
  });

  it('gravar em outro tenant é negado', async () => {
    await expect(
      runAsTenantWithRole(t1.tenantId, t1.congregationId, (tx) =>
        tx.pixPayment.create({
          data: intent({ ...t2, categoryId: t2.ofertaCategoryId }, 'intrusa-t2'),
        }),
      ),
    ).rejects.toThrow();
  });

  it('confirmar (UPDATE) intenção da congregação irmã não atinge linha nenhuma', async () => {
    const { count } = await runAsTenantWithRole(t1.tenantId, t1.congregationId, (tx) =>
      tx.pixPayment.updateMany({ where: { id: rowExtraId }, data: { status: 'confirmed' } }),
    );

    expect(count).toBe(0);
  });

  it('USING e WITH CHECK da policy são idênticos', async () => {
    const [policy] = await prismaAdmin.$queryRaw<{ qual: string; with_check: string }[]>`
      SELECT qual, with_check FROM pg_policies
       WHERE tablename = 'pix_payments' AND policyname = 'tenant_congregation_isolation'
    `;

    expect(policy.with_check).toBe(policy.qual);
  });
});
