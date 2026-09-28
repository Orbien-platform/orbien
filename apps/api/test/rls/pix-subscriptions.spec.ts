/**
 * RLS — PIX recorrente / dízimo automático via Asaas (PROD-27)
 *
 * `pix_subscriptions` é tabela NOVA, e o que este arquivo mede é que ela
 * nasceu com a policy certa: escopo de CONGREGAÇÃO
 * (`023_rls_pix_subscriptions.sql`, AD-001) — diferente de `pix_payments`,
 * que é de `001_rls_setup.sql` e ficou só no isolamento de tenant. Sem o
 * script, a tabela ficaria sem RLS e `app_user` — que tem GRANT em tudo em
 * `public` por ALTER DEFAULT PRIVILEGES — leria (e cancelaria) a assinatura
 * de dízimo automático de qualquer outra igreja.
 *
 * Duas congregações do MESMO tenant, de propósito: o caso que só o
 * isolamento por tenant deixaria passar. Uma terceira congregação de outro
 * tenant cobre o eixo de fora.
 *
 * `runAsTenantWithRole` e não `runAsTenant`: a policy é `TO app_user`, e é
 * essa a forma como a produção roda (o `TenantContextInterceptor` faz
 * `SET LOCAL ROLE app_user` antes do `set_config`).
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congBId: string;

let categoryA1Id: string;
let categoryA2Id: string;
let donorA1Id: string;
let donorA2Id: string;
let adminA1Id: string;

let subA1Id: string;
let subA2Id: string;

beforeAll(async () => {
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `pixsub-a-${ts}`, name: 'Tenant A (PIX recorrente)' },
  });
  tenantAId = tenantA.id;
  congA1Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })
  ).id;
  congA2Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Filial' } })
  ).id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `pixsub-b-${ts}`, name: 'Tenant B (PIX recorrente)' },
  });
  tenantBId = tenantB.id;
  congBId = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } })
  ).id;

  categoryA1Id = (
    await prismaAdmin.financialCategory.create({
      data: { tenant_id: tenantAId, congregation_id: congA1Id, name: 'Dízimo', type: 'income' },
    })
  ).id;
  categoryA2Id = (
    await prismaAdmin.financialCategory.create({
      data: { tenant_id: tenantAId, congregation_id: congA2Id, name: 'Dízimo', type: 'income' },
    })
  ).id;
  const categoryBId = (
    await prismaAdmin.financialCategory.create({
      data: { tenant_id: tenantBId, congregation_id: congBId, name: 'Dízimo', type: 'income' },
    })
  ).id;

  donorA1Id = (
    await prismaAdmin.person.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA1Id,
        full_name: `Dizimista A-Sede ${ts}`,
        classification: 'member',
        gender: 'male',
      },
    })
  ).id;
  donorA2Id = (
    await prismaAdmin.person.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA2Id,
        full_name: `Dizimista A-Filial ${ts}`,
        classification: 'member',
        gender: 'female',
      },
    })
  ).id;
  const donorBId = (
    await prismaAdmin.person.create({
      data: {
        tenant_id: tenantBId,
        congregation_id: congBId,
        full_name: `Dizimista B-Sede ${ts}`,
        classification: 'member',
        gender: 'male',
      },
    })
  ).id;

  const adminA1 = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congA1Id,
      email: `pixsub-a1-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  adminA1Id = adminA1.id;

  subA1Id = (
    await prismaAdmin.pixSubscription.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA1Id,
        donor_person_id: donorA1Id,
        category_id: categoryA1Id,
        amount: '50.00',
        asaas_subscription_id: `sub-a1-${ts}`,
        status: 'active',
        created_by_user_id: adminA1.id,
      },
    })
  ).id;
  subA2Id = (
    await prismaAdmin.pixSubscription.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA2Id,
        donor_person_id: donorA2Id,
        category_id: categoryA2Id,
        amount: '30.00',
        asaas_subscription_id: `sub-a2-${ts}`,
        status: 'active',
        created_by_user_id: adminA1.id,
      },
    })
  ).id;
  await prismaAdmin.pixSubscription.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congBId,
      donor_person_id: donorBId,
      category_id: categoryBId,
      amount: '20.00',
      asaas_subscription_id: `sub-b-${ts}`,
      status: 'active',
      created_by_user_id: adminA1.id,
    },
  });
}, 60_000);

afterAll(async () => {
  await prismaAdmin.pixSubscription.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.person.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.financialCategory.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.userAccount.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('pix_subscriptions — isolamento (PROD-27)', () => {
  it('a congregação vê a própria assinatura (controle positivo)', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.pixSubscription.findUnique({ where: { id: subA1Id } }),
    );

    expect(row?.donor_person_id).toBe(donorA1Id);
  });

  it('a congregação IRMÃ, do mesmo tenant, não vê — é o caso que só tenant_id deixaria passar', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.pixSubscription.findUnique({ where: { id: subA2Id } }),
    );

    expect(row).toBeNull();
  });

  it('listagem ampla só traz a congregação do contexto', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congA1Id, (tx) => tx.pixSubscription.findMany());

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.congregation_id === congA1Id)).toBe(true);
  });

  it('o outro tenant não vê nada de A', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congBId, (tx) =>
      tx.pixSubscription.findMany({ where: { tenant_id: tenantAId } }),
    );

    expect(rows).toHaveLength(0);
  });

  it('criar assinatura na congregação alheia é negado — o WITH CHECK diz o mesmo que o USING', async () => {
    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.pixSubscription.create({
          data: {
            tenant_id: tenantAId,
            congregation_id: congA2Id,
            donor_person_id: donorA1Id,
            category_id: categoryA1Id,
            amount: '15.00',
            asaas_subscription_id: `sub-intrusa-${ts}`,
            status: 'active',
            created_by_user_id: adminA1Id,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('cancelar (UPDATE) a assinatura da congregação irmã não atinge linha nenhuma', async () => {
    const { count } = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.pixSubscription.updateMany({
        where: { id: subA2Id },
        data: { status: 'cancelled', cancelled_at: new Date() },
      }),
    );

    expect(count).toBe(0);
  });
});
