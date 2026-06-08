/**
 * RLS Isolation Test Suite
 *
 * Tests that multi-tenant data isolation works correctly at the database level.
 *
 * SECURITY INVARIANT: A failing test here means a REAL security gap exists.
 * Do NOT adjust assertions to make tests pass — report failures as-is.
 *
 * Architecture under test:
 *   - TenantContextInterceptor sets app.tenant_id + app.congregation_id via SET LOCAL
 *   - RLS policies (if enabled) use app_current_tenant() / app_current_congregation_id()
 *   - Prisma connects as postgres superuser → BYPASSRLS unless FORCE ROW LEVEL SECURITY applied
 *
 * Two helper variants are used to expose the gap clearly:
 *   - runAsTenant: mimics what the app actually does (no role switch)
 *   - runAsTenantWithRole: sets ROLE app_user so RLS policies are enforced
 *
 * If runAsTenant FAILS to isolate data → the app leaks data today.
 * If runAsTenantWithRole FAILS to isolate data → RLS policies are broken.
 */

import {
  prisma,
  runAsTenant,
  runAsTenantWithRole,
} from '../helpers/rls';

// ─── Test fixture identifiers ─────────────────────────────────────────────────

let tenantAId: string;
let congregationAId: string;
let userAccountAId: string;
let personAId: string;
let categoryAId: string;
let smallGroupAId: string;
let transactionAId: string;
let pixPaymentAId: string;

let tenantBId: string;
let congregationBId: string;
let userAccountBId: string;
let personBId: string;
let categoryBId: string;

// Second congregation within Tenant A (for cross-congregation test)
let congregationA2Id: string;
let personA2Id: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // Create Tenant A
  const tenantA = await prisma.tenant.create({
    data: { slug: `rls-test-a-${Date.now()}`, name: 'RLS Test Church A' },
  });
  tenantAId = tenantA.id;

  const congA = await prisma.congregation.create({
    data: { tenant_id: tenantAId, name: 'Congregation A-Main' },
  });
  congregationAId = congA.id;

  const congA2 = await prisma.congregation.create({
    data: { tenant_id: tenantAId, name: 'Congregation A-Second' },
  });
  congregationA2Id = congA2.id;

  const userA = await prisma.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      email: `admin-a-${Date.now()}@rls-test.local`,
      password_hash: 'x',
    },
  });
  userAccountAId = userA.id;

  const personA = await prisma.person.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      full_name: 'Person A Main',
      classification: 'member',
      gender: 'male',
    },
  });
  personAId = personA.id;

  const personA2 = await prisma.person.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationA2Id,
      full_name: 'Person A Second Cong',
      classification: 'member',
      gender: 'female',
    },
  });
  personA2Id = personA2.id;

  const catA = await prisma.financialCategory.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Dízimo A',
      type: 'income',
    },
  });
  categoryAId = catA.id;

  const sgA = await prisma.smallGroup.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Célula A',
      type: 'cell',
      leader_person_id: personAId,
    },
  });
  smallGroupAId = sgA.id;

  const txA = await prisma.financialTransaction.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      type: 'income',
      amount: 100.0,
      occurred_at: new Date(),
      category_id: categoryAId,
      source: 'manual',
      created_by_user_id: userAccountAId,
      donor_person_id: personAId,
      is_anonymous: false,
    },
  });
  transactionAId = txA.id;

  const pixA = await prisma.pixPayment.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      scenario: 'manual',
      amount: 50.0,
      category_id: categoryAId,
      status: 'pending',
      pix_key: 'chave-pix-a',
    },
  });
  pixPaymentAId = pixA.id;

  // Create Tenant B (the "attacker" tenant)
  const tenantB = await prisma.tenant.create({
    data: { slug: `rls-test-b-${Date.now()}`, name: 'RLS Test Church B' },
  });
  tenantBId = tenantB.id;

  const congB = await prisma.congregation.create({
    data: { tenant_id: tenantBId, name: 'Congregation B' },
  });
  congregationBId = congB.id;

  const userB = await prisma.userAccount.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      email: `admin-b-${Date.now()}@rls-test.local`,
      password_hash: 'x',
    },
  });
  userAccountBId = userB.id;

  const personB = await prisma.person.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      full_name: 'Person B Attacker',
      classification: 'member',
      gender: 'male',
    },
  });
  personBId = personB.id;

  const catB = await prisma.financialCategory.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      name: 'Dízimo B',
      type: 'income',
    },
  });
  categoryBId = catB.id;
}, 60_000);

afterAll(async () => {
  // Cascading deletes via tenant removal clean up all child records.
  await prisma.tenant.deleteMany({
    where: { id: { in: [tenantAId, tenantBId] } },
  });
  await prisma.$disconnect();
}, 30_000);

// ─── Helper: count rows visible to Tenant B that belong to Tenant A ──────────

async function countVisibleFromB<T extends { tenant_id: string }>(
  rows: T[],
): Promise<number> {
  return rows.filter((r) => r.tenant_id === tenantAId).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cross-tenant read — Person
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Cross-tenant read — Person', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A persons', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.person.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: Tenant B queried tenant_id=${tenantAId} and got ${leaked} person(s). ` +
          'RLS is not enforced for the postgres role — FORCE ROW LEVEL SECURITY is missing or app_user role is never set.',
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role (runAsTenantWithRole): Tenant B cannot see Tenant A persons', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.person.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: Even with app_user role, ${leaked} person(s) from Tenant A are visible to Tenant B. ` +
          'RLS policy is incorrect or missing.',
      );
    }
    expect(leaked).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cross-tenant read — FinancialTransaction
// ─────────────────────────────────────────────────────────────────────────────
describe('2. Cross-tenant read — FinancialTransaction', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A transactions', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.financialTransaction.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = await countVisibleFromB(rows);
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} financial_transaction(s) from Tenant A are visible to Tenant B context.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot see Tenant A transactions', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.financialTransaction.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = await countVisibleFromB(rows);
    if (leaked > 0) {
      console.error(
        `SECURITY GAP (app_user role): ${leaked} financial_transaction(s) leaked across tenant boundary.`,
      );
    }
    expect(leaked).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cross-tenant read — SmallGroup
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Cross-tenant read — SmallGroup', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A small groups', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.smallGroup.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = await countVisibleFromB(rows);
    if (leaked > 0) {
      console.error(`SECURITY GAP: ${leaked} small_group(s) leaked to Tenant B.`);
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot see Tenant A small groups', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.smallGroup.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = await countVisibleFromB(rows);
    if (leaked > 0) {
      console.error(`SECURITY GAP (app_user role): ${leaked} small_group(s) leaked.`);
    }
    expect(leaked).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cross-congregation read (within same tenant)
// ─────────────────────────────────────────────────────────────────────────────
describe('4. Cross-congregation read (same tenant)', () => {
  it('Congregation A-Main context cannot see Congregation A-Second persons', async () => {
    const rows = await runAsTenant(tenantAId, congregationAId, (tx) =>
      tx.person.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    const leaked = rows.filter((r) => r.congregation_id === congregationA2Id).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} person(s) from a sibling congregation are visible. ` +
          'congregation_id isolation is not enforced.',
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Congregation A-Main cannot see Congregation A-Second persons', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congregationAId, (tx) =>
      tx.person.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    const leaked = rows.filter((r) => r.congregation_id === congregationA2Id).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP (app_user role): ${leaked} cross-congregation person(s) visible.`,
      );
    }
    expect(leaked).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cross-tenant write (INSERT) — WITH CHECK policy
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Cross-tenant write — INSERT WITH CHECK', () => {
  it('app_user role: Tenant B cannot INSERT a person with tenant_id = Tenant A', async () => {
    let insertSucceeded = false;
    try {
      await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
        tx.person.create({
          data: {
            // Attempt to forge tenant ownership
            tenant_id: tenantAId,
            congregation_id: congregationAId,
            full_name: 'Forged Person from B',
            classification: 'member',
            gender: 'male',
          },
        }),
      );
      insertSucceeded = true;
    } catch {
      // Expected: RLS WITH CHECK violation → error
    }

    if (insertSucceeded) {
      console.error(
        'SECURITY GAP: Tenant B was able to INSERT a person with tenant_id = Tenant A. ' +
          'WITH CHECK policy on person table is missing or not enforced.',
      );
      // Cleanup the forged record
      await prisma.person.deleteMany({
        where: { full_name: 'Forged Person from B', tenant_id: tenantAId },
      });
    }

    expect(insertSucceeded).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Update tampering — tenant_id change rejection
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Update tampering — tenant_id change', () => {
  it('app_user role: Tenant B cannot update a Tenant A record', async () => {
    let updateSucceeded = false;
    try {
      await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
        tx.person.update({
          where: { id: personAId },
          data: { full_name: 'HIJACKED by B' },
        }),
      );
      updateSucceeded = true;
    } catch {
      // Expected: RLS USING policy prevents seeing/updating the row
    }

    if (updateSucceeded) {
      const check = await prisma.person.findUnique({ where: { id: personAId } });
      const actuallyMutated = check?.full_name === 'HIJACKED by B';
      if (actuallyMutated) {
        console.error(
          'SECURITY GAP: Tenant B successfully updated a Tenant A person record. ' +
            'RLS USING policy is missing or not enforced — cross-tenant writes are possible.',
        );
        // Restore the record
        await prisma.person.update({
          where: { id: personAId },
          data: { full_name: 'Person A Main' },
        });
      } else {
        console.warn(
          'Partial gap: update() returned success but DB value was not mutated — ' +
            'the operation may have silently no-oped.',
        );
      }
      expect(actuallyMutated).toBe(false);
    } else {
      expect(updateSucceeded).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Donor privacy — financial_transaction direct lookup by ID
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Donor privacy — financial_transaction by ID', () => {
  it('app context (runAsTenant): Tenant B cannot fetch a Tenant A transaction by ID', async () => {
    const row = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.financialTransaction.findUnique({ where: { id: transactionAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP: Tenant B fetched a specific financial_transaction (id=${transactionAId}) ` +
          'belonging to Tenant A by using findUnique with a known ID. ' +
          'RLS is not enforced — donor identity and amounts are exposed.',
      );
    }
    expect(row).toBeNull();
  });

  it('app_user role: Tenant B cannot fetch a Tenant A transaction by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.financialTransaction.findUnique({ where: { id: transactionAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): findUnique on financial_transaction id=${transactionAId} ` +
          'returned a row to Tenant B. RLS USING policy is insufficient.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. PIX payment isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('8. PIX payment isolation', () => {
  it('app context (runAsTenant): Tenant B cannot list Tenant A PIX payments', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.pixPayment.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} pix_payment record(s) from Tenant A visible to Tenant B. ` +
          'PIX keys and payment details are exposed cross-tenant.',
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A PIX payment by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.pixPayment.findUnique({ where: { id: pixPaymentAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): pix_payment id=${pixPaymentAId} from Tenant A ` +
          'is visible to Tenant B. PIX key leakage confirmed.',
      );
    }
    expect(row).toBeNull();
  });
});
