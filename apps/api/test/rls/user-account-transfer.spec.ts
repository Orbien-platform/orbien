/**
 * RLS — Transferência de conta entre tenants (login-email-global, P2)
 *
 * O design da feature é explícito: nenhuma policy de user_accounts/persons
 * precisa mudar para esta transferência funcionar — a `tenant_isolation`
 * comum já basta, porque ela compara `tenant_id` da LINHA com
 * `app_current_tenant()` do CONTEXTO, não algum vínculo fixo no momento da
 * criação. Mudar o `tenant_id` da linha (o que `TransferUserAccountService`
 * faz) já é suficiente para a policy deixar de reconhecer o tenant antigo
 * como dono.
 *
 * Este teste prova as duas metades do contrato (spec P2, AC1 + AC6):
 *
 *   (a) depois da transferência, o tenant de ORIGEM não vê mais a conta nem
 *       a pessoa via `app_user` (RLS normal, mesmo padrão de isolation.spec.ts);
 *   (b) um registro histórico com `tenant_id` PRÓPRIO (uma
 *       `financial_transaction` fabricada ANTES da transferência) continua
 *       visível para o tenant de origem depois — porque ele nunca dependeu do
 *       tenant atual da conta/pessoa, só do seu próprio `tenant_id` gravado.
 *
 * A mutação em si (`UserAccount.tenant_id`/`Person.tenant_id`) é feita direto
 * via `prismaAdmin`, espelhando exatamente o que `TransferUserAccountService`
 * grava dentro da transação — o que está sob teste aqui é a policy de RLS
 * reagir a essa mudança, não a lógica do serviço (já coberta, mockada, em
 * `transfer-user-account.service.spec.ts`).
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantOriginId: string;
let congregationOriginId: string;
let tenantDestId: string;
let congregationDestId: string;

let personId: string;
let userAccountId: string;
let categoryOriginId: string;
let financialTransactionId: string;

beforeAll(async () => {
  const tenantOrigin = await prismaAdmin.tenant.create({
    data: { slug: `transfer-origin-${ts}`, name: 'Tenant Origem (transferência)' },
  });
  tenantOriginId = tenantOrigin.id;

  const congOrigin = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantOriginId, name: 'Origem — Sede' },
  });
  congregationOriginId = congOrigin.id;

  const tenantDest = await prismaAdmin.tenant.create({
    data: { slug: `transfer-dest-${ts}`, name: 'Tenant Destino (transferência)' },
  });
  tenantDestId = tenantDest.id;

  const congDest = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantDestId, name: 'Destino — Sede' },
  });
  congregationDestId = congDest.id;

  const person = await prismaAdmin.person.create({
    data: {
      tenant_id: tenantOriginId,
      congregation_id: congregationOriginId,
      full_name: 'Pessoa Transferida (RLS Test)',
      classification: 'member',
      gender: 'male',
    },
  });
  personId = person.id;

  const userAccount = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantOriginId,
      congregation_id: congregationOriginId,
      email: `transferida-${ts}@rls-test.local`,
      password_hash: 'x',
      person_id: personId,
    },
  });
  userAccountId = userAccount.id;

  const category = await prismaAdmin.financialCategory.create({
    data: {
      tenant_id: tenantOriginId,
      congregation_id: congregationOriginId,
      name: 'Dízimo Origem (RLS Test)',
      type: 'income',
    },
  });
  categoryOriginId = category.id;

  // Histórico gravado ANTES da transferência — período em que a pessoa ainda
  // estava no tenant de origem. É o registro que AUTH-12 exige continuar
  // visível para quem administra o tenant de origem depois.
  const transaction = await prismaAdmin.financialTransaction.create({
    data: {
      tenant_id: tenantOriginId,
      congregation_id: congregationOriginId,
      type: 'income',
      amount: 250.0,
      occurred_at: new Date(),
      category_id: categoryOriginId,
      source: 'manual',
      created_by_user_id: userAccountId,
      donor_person_id: personId,
      is_anonymous: false,
    },
  });
  financialTransactionId = transaction.id;
}, 60_000);

afterAll(async () => {
  await prismaAdmin.financialTransaction.deleteMany({
    where: { id: financialTransactionId },
  });
  await prismaAdmin.financialCategory.deleteMany({
    where: { id: categoryOriginId },
  });
  await prismaAdmin.refreshToken.deleteMany({ where: { user_account_id: userAccountId } });
  await prismaAdmin.userAccount.deleteMany({ where: { id: userAccountId } });
  await prismaAdmin.person.deleteMany({ where: { id: personId } });
  await prismaAdmin.tenant.deleteMany({
    where: { id: { in: [tenantOriginId, tenantDestId] } },
  });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('Antes da transferência — controle positivo', () => {
  it('o tenant de origem vê a própria conta e pessoa (garante que o teste não passa por vacuidade)', async () => {
    const seen = await runAsTenantWithRole(tenantOriginId, congregationOriginId, async (tx) => ({
      account: await tx.userAccount.findUnique({ where: { id: userAccountId } }),
      person: await tx.person.findUnique({ where: { id: personId } }),
    }));

    expect(seen.account).not.toBeNull();
    expect(seen.person).not.toBeNull();
  });
});

describe('Depois da transferência', () => {
  beforeAll(async () => {
    // Espelha exatamente o que TransferUserAccountService grava dentro da
    // transação de negócio — mesma conta, mesmo person_id, só tenant/
    // congregação atualizados.
    await prismaAdmin.userAccount.update({
      where: { id: userAccountId },
      data: { tenant_id: tenantDestId, congregation_id: congregationDestId },
    });
    await prismaAdmin.person.update({
      where: { id: personId },
      data: { tenant_id: tenantDestId, congregation_id: congregationDestId },
    });
  });

  it('AC1/AC6 (a): o tenant de ORIGEM não vê mais a conta transferida', async () => {
    const account = await runAsTenantWithRole(tenantOriginId, congregationOriginId, (tx) =>
      tx.userAccount.findUnique({ where: { id: userAccountId } }),
    );

    expect(account).toBeNull();
  });

  it('AC1/AC6 (a): o tenant de ORIGEM não vê mais a pessoa transferida', async () => {
    const person = await runAsTenantWithRole(tenantOriginId, congregationOriginId, (tx) =>
      tx.person.findUnique({ where: { id: personId } }),
    );

    expect(person).toBeNull();
  });

  it('AC1/AC6 (a): a conta transferida some até de uma listagem ampla do tenant de origem', async () => {
    const accounts = await runAsTenantWithRole(tenantOriginId, congregationOriginId, (tx) =>
      tx.userAccount.findMany(),
    );

    expect(accounts.map((a) => a.id)).not.toContain(userAccountId);
  });

  it('AC1/AC6 (b): o tenant de destino agora vê a conta e a pessoa, no tenant/congregação novos', async () => {
    const seen = await runAsTenantWithRole(tenantDestId, congregationDestId, async (tx) => ({
      account: await tx.userAccount.findUnique({ where: { id: userAccountId } }),
      person: await tx.person.findUnique({ where: { id: personId } }),
    }));

    expect(seen.account?.tenant_id).toBe(tenantDestId);
    expect(seen.account?.congregation_id).toBe(congregationDestId);
    expect(seen.person?.tenant_id).toBe(tenantDestId);
    expect(seen.person?.congregation_id).toBe(congregationDestId);
  });

  it('AC6: registro histórico com tenant_id próprio (financial_transaction) continua visível para o tenant de origem', async () => {
    const transaction = await runAsTenantWithRole(tenantOriginId, congregationOriginId, (tx) =>
      tx.financialTransaction.findUnique({ where: { id: financialTransactionId } }),
    );

    expect(transaction).not.toBeNull();
    expect(transaction?.tenant_id).toBe(tenantOriginId);
    expect(Number(transaction?.amount)).toBe(250);
  });

  it('AC6: o mesmo registro histórico não passa a ser visível para o tenant de destino', async () => {
    const transaction = await runAsTenantWithRole(tenantDestId, congregationDestId, (tx) =>
      tx.financialTransaction.findUnique({ where: { id: financialTransactionId } }),
    );

    expect(transaction).toBeNull();
  });
});
