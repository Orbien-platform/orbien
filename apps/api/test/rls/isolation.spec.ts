/**
 * RLS Isolation Test Suite
 *
 * Tests that multi-tenant data isolation works correctly at the database level.
 *
 * SECURITY INVARIANT: A failing test here means a REAL security gap exists.
 * Do NOT adjust assertions to make tests pass — report failures as-is.
 *
 * Architecture under test:
 *   - prismaAdmin (postgres, BYPASSRLS) — used only for fixture setup/teardown
 *   - prisma (orbien_app, NOBYPASSRLS) — used for all isolation assertions
 *   - TenantContextInterceptor sets app.tenant_id + app.congregation_id via SET LOCAL
 *   - RLS policies use app_current_tenant() which reads app.tenant_id
 *   - FORCE ROW LEVEL SECURITY is applied on all data tables
 *
 * Two helper variants:
 *   - runAsTenant: mimics production (orbien_app + SET LOCAL, no role switch)
 *   - runAsTenantWithRole: also does SET LOCAL ROLE app_user (explicit policy enforcement)
 *
 * If runAsTenant FAILS → data leaks in production today.
 * If runAsTenantWithRole FAILS → RLS policies themselves are broken.
 */

import {
  prisma,
  prismaAdmin,
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

// Sprint 8 — Celebrations module fixtures (Tenant A)
let celebrationAId: string;
let celebrationInstanceAId: string;
let serviceOrderAId: string;
let serviceOrderItemAId: string;
let setlistAId: string;
let setlistSongAId: string;

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  // All fixture creation uses prismaAdmin (postgres, BYPASSRLS) so inserts
  // are not blocked by RLS. The isolation assertions use prisma (orbien_app).
  const ts = Date.now();

  // Create Tenant A
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `rls-test-a-${ts}`, name: 'RLS Test Church A' },
  });
  tenantAId = tenantA.id;

  const congA = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantAId, name: 'Congregation A-Main' },
  });
  congregationAId = congA.id;

  const congA2 = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantAId, name: 'Congregation A-Second' },
  });
  congregationA2Id = congA2.id;

  const userA = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      email: `admin-a-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  userAccountAId = userA.id;

  const personA = await prismaAdmin.person.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      full_name: 'Person A Main',
      classification: 'member',
      gender: 'male',
    },
  });
  personAId = personA.id;

  const personA2 = await prismaAdmin.person.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationA2Id,
      full_name: 'Person A Second Cong',
      classification: 'member',
      gender: 'female',
    },
  });
  personA2Id = personA2.id;

  const catA = await prismaAdmin.financialCategory.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Dízimo A',
      type: 'income',
    },
  });
  categoryAId = catA.id;

  const sgA = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Célula A',
      type: 'cell',
      leader_person_id: personAId,
    },
  });
  smallGroupAId = sgA.id;

  const txA = await prismaAdmin.financialTransaction.create({
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

  const pixA = await prismaAdmin.pixPayment.create({
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

  // Sprint 8 fixtures: Celebrations → Instance → ServiceOrder → Item → Setlist → Song
  const celebA = await prismaAdmin.celebration.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Culto RLS Test A',
      type: 'sunday_service',
      start_time: '19:00',
      recurrence: 'weekly',
    },
  });
  celebrationAId = celebA.id;

  const instanceA = await prismaAdmin.celebrationInstance.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      celebration_id: celebrationAId,
      scheduled_date: new Date('2030-01-05'),
    },
  });
  celebrationInstanceAId = instanceA.id;

  const soA = await prismaAdmin.serviceOrder.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      celebration_instance_id: celebrationInstanceAId,
      title: 'OC RLS Test A',
    },
  });
  serviceOrderAId = soA.id;

  const itemA = await prismaAdmin.serviceOrderItem.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      service_order_id: serviceOrderAId,
      sequence: 1,
      name: 'Abertura',
      start_offset_minutes: 0,
      duration_minutes: 5,
      responsible_type: 'free_text',
      responsible_label: 'Host',
    },
  });
  serviceOrderItemAId = itemA.id;

  const slA = await prismaAdmin.setlist.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      service_order_item_id: serviceOrderItemAId,
    },
  });
  setlistAId = slA.id;

  const songA = await prismaAdmin.setlistSong.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      setlist_id: setlistAId,
      sequence: 1,
      title: 'Música RLS Test',
      key: 'G',
    },
  });
  setlistSongAId = songA.id;

  // Create Tenant B (the "attacker" tenant)
  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `rls-test-b-${ts}`, name: 'RLS Test Church B' },
  });
  tenantBId = tenantB.id;

  const congB = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantBId, name: 'Congregation B' },
  });
  congregationBId = congB.id;

  const userB = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      email: `admin-b-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  userAccountBId = userB.id;

  const personB = await prismaAdmin.person.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      full_name: 'Person B Attacker',
      classification: 'member',
      gender: 'male',
    },
  });
  personBId = personB.id;

  const catB = await prismaAdmin.financialCategory.create({
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
  await prismaAdmin.tenant.deleteMany({
    where: { id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.$disconnect();
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
      await prismaAdmin.person.deleteMany({
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
      const check = await prismaAdmin.person.findUnique({ where: { id: personAId } });
      const actuallyMutated = check?.full_name === 'HIJACKED by B';
      if (actuallyMutated) {
        console.error(
          'SECURITY GAP: Tenant B successfully updated a Tenant A person record. ' +
            'RLS USING policy is missing or not enforced — cross-tenant writes are possible.',
        );
        // Restore the record
        await prismaAdmin.person.update({
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

// ─────────────────────────────────────────────────────────────────────────────
// 9. Celebrations isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('9. Cross-tenant read — Celebration', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A celebrations', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.celebration.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} celebration record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A celebration by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.celebration.findUnique({ where: { id: celebrationAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): celebration id=${celebrationAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. CelebrationInstance isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('10. Cross-tenant read — CelebrationInstance', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A instances', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.celebrationInstance.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} celebration_instance record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A instance by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.celebrationInstance.findUnique({ where: { id: celebrationInstanceAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): celebration_instance id=${celebrationInstanceAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. ServiceOrder isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('11. Cross-tenant read — ServiceOrder', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A service orders', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.serviceOrder.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} service_order record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A service order by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.serviceOrder.findUnique({ where: { id: serviceOrderAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): service_order id=${serviceOrderAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Setlist isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('12. Cross-tenant read — Setlist', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A setlists', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.setlist.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} setlist record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A setlist by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.setlist.findUnique({ where: { id: setlistAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): setlist id=${setlistAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. SetlistSong isolation
// ─────────────────────────────────────────────────────────────────────────────
describe('13. Cross-tenant read — SetlistSong', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A setlist songs', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.setlistSong.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} setlist_song record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A setlist song by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.setlistSong.findUnique({ where: { id: setlistSongAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): setlist_song id=${setlistSongAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});
