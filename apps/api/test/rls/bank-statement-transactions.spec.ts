/**
 * RLS — conciliação bancária OFX (PROD-07)
 *
 * `bank_statement_transactions` é tabela NOVA (PR #107), e o que este arquivo
 * mede é que a policy embutida na migration
 * (`20260920022955_add_bank_statement_transactions`) — reafirmada de forma
 * idempotente por `019_rls_bank_statement_transactions.sql` — de fato isola.
 * Sem ela, `app_user` — que tem GRANT em tudo em `public` por ALTER DEFAULT
 * PRIVILEGES — leria (e conciliaria) o extrato bancário de qualquer outra
 * igreja.
 *
 * Duas congregações do MESMO tenant, de propósito: o caso que só o
 * isolamento por tenant deixaria passar. Uma terceira congregação de outro
 * tenant cobre o eixo de fora.
 *
 * `runAsTenantWithRole`, não `runAsUser`: a policy é o Padrão B simples de
 * `export_jobs`/`import_jobs` — `current_setting` direto, sem
 * `app_congregation_allowed()` nem exceção de `tenant_admin` (decisão em
 * docs/PLANO.md, PROD-07) — então não depende de `app_current_user()`.
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congBId: string;

let txA1Id: string;
let txA2Id: string;
let importJobA2Id: string;

async function createTransaction(
  tenantId: string,
  congregationId: string,
  userId: string,
  label: string,
) {
  const importJob = await prismaAdmin.importJob.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      type: 'financial_ofx',
      created_by: userId,
    },
  });
  const transaction = await prismaAdmin.bankStatementTransaction.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      import_job_id: importJob.id,
      fitid: `fitid-${label}-${ts}`,
      posted_at: new Date(),
      amount: 100,
      is_credit: true,
    },
  });
  return { importJobId: importJob.id, transactionId: transaction.id };
}

beforeAll(async () => {
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `ofx-a-${ts}`, name: 'Tenant A (conciliação OFX)' },
  });
  tenantAId = tenantA.id;
  congA1Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })
  ).id;
  congA2Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Filial' } })
  ).id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `ofx-b-${ts}`, name: 'Tenant B (conciliação OFX)' },
  });
  tenantBId = tenantB.id;
  congBId = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } })
  ).id;

  const userA1Id = (
    await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA1Id,
        email: `ofx-a1-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    })
  ).id;
  const userBId = (
    await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantBId,
        congregation_id: congBId,
        email: `ofx-b-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    })
  ).id;

  txA1Id = (await createTransaction(tenantAId, congA1Id, userA1Id, 'A-Sede')).transactionId;
  const txA2 = await createTransaction(tenantAId, congA2Id, userA1Id, 'A-Filial');
  txA2Id = txA2.transactionId;
  importJobA2Id = txA2.importJobId;
  await createTransaction(tenantBId, congBId, userBId, 'B-Sede');
}, 60_000);

afterAll(async () => {
  await prismaAdmin.bankStatementTransaction.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.importJob.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.userAccount.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.congregation.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('bank_statement_transactions — isolamento (PROD-07)', () => {
  it('a congregação vê a própria linha de extrato (controle positivo)', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.bankStatementTransaction.findUnique({ where: { id: txA1Id } }),
    );

    expect(row).not.toBeNull();
  });

  it('a congregação IRMÃ, do mesmo tenant, não vê — é o caso que só tenant_id deixaria passar', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.bankStatementTransaction.findUnique({ where: { id: txA2Id } }),
    );

    expect(row).toBeNull();
  });

  it('listagem ampla só traz a congregação do contexto', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.bankStatementTransaction.findMany(),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.congregation_id === congA1Id)).toBe(true);
  });

  it('o outro tenant não vê nada de A', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congBId, (tx) =>
      tx.bankStatementTransaction.findMany({ where: { tenant_id: tenantAId } }),
    );

    expect(rows).toHaveLength(0);
  });

  it('escrever linha de extrato na congregação alheia é negado — o WITH CHECK diz o mesmo que o USING', async () => {
    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.bankStatementTransaction.create({
          data: {
            tenant_id: tenantAId,
            congregation_id: congA2Id,
            import_job_id: importJobA2Id,
            fitid: `intruso-${ts}`,
            posted_at: new Date(),
            amount: 1,
            is_credit: true,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('apagar a linha da congregação irmã não atinge linha nenhuma', async () => {
    const { count } = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.bankStatementTransaction.deleteMany({ where: { id: txA2Id } }),
    );

    expect(count).toBe(0);
  });
});
