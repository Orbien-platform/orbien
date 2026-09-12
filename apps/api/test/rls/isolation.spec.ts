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
  runAsUser,
} from '../helpers/rls';

// ─── Test fixture identifiers ─────────────────────────────────────────────────

let tenantAId: string;
let congregationAId: string;
let userAccountAId: string;
let personAId: string;
let categoryAId: string;
let transactionAId: string;
let pixPaymentAId: string;

let tenantBId: string;
let congregationBId: string;

// Second congregation within Tenant A (for cross-congregation test)
let congregationA2Id: string;
let personA2Id: string;
let songA2Id: string;
let userAccountA2Id: string;
let notifPrefAId: string;
let notifPrefA2Id: string;
let prayerRequestA2Id: string;
let studyMaterialAId: string;
let studyMaterialVersionAId: string;

// Contas com papel, na congregação A-Main — para exercitar o ramo
// `OR app_has_role('tenant_admin')` da policy, que os helpers sem
// `app.user_id` nunca alcançam.
let tenantAdminUserId: string;
let congAdminUserId: string;

// Sprint 8 — Celebrations module fixtures (Tenant A)
let celebrationAId: string;
let celebrationInstanceAId: string;
let serviceOrderAId: string;
let serviceOrderItemAId: string;
let setlistAId: string;
let setlistSongAId: string;

// Sprint 11.2 — escalas por celebração (Tenant A)
let ministryAId: string;
let volunteerProfileAId: string;
let celebrationScheduleAId: string;
let celebrationMinistryAId: string;
let celebrationAssignmentAId: string;
let unavailabilityAId: string;
let unavailabilityDateAId: string;
let scheduleTemplateAId: string;
let scheduleTemplateMinistryAId: string;

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

  const songA2 = await prismaAdmin.song.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationA2Id,
      title: 'Música RLS Test — A-Second',
      key: 'D',
    },
  });
  songA2Id = songA2.id;

  // Feature preferencias-notificacao-mobile (MOB-10) — fixtures para o bloco
  // 24 (isolamento de notification_preferences). userAccountAId já existe
  // (A-Main); precisa de uma segunda conta na A-Second para exercitar
  // congregação irmã.
  const userA2 = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationA2Id,
      email: `user-a2-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  userAccountA2Id = userA2.id;

  const notifPrefA = await prismaAdmin.notificationPreference.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      user_account_id: userAccountAId,
    },
  });
  notifPrefAId = notifPrefA.id;

  const notifPrefA2 = await prismaAdmin.notificationPreference.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationA2Id,
      user_account_id: userAccountA2Id,
    },
  });
  notifPrefA2Id = notifPrefA2.id;

  // PROD-01: pedido de oração numa célula da A-Second, para provar que
  // `009_rls_prayer_requests.sql` isola por congregação — a tabela nasceu em
  // 001 só com isolamento de tenant, e o conteúdo é dado sensível.
  const groupTypeA2 = await prismaAdmin.groupType.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationA2Id,
      name: 'Célula A-Second',
    },
  });

  const groupA2 = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationA2Id,
      name: 'Célula A-Second',
      group_type_id: groupTypeA2.id,
      leader_person_id: personA2Id,
    },
  });

  const prayerA2 = await prismaAdmin.prayerRequest.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationA2Id,
      small_group_id: groupA2.id,
      person_id: personA2Id,
      content: 'Pedido RLS Test — A-Second',
    },
  });
  prayerRequestA2Id = prayerA2.id;

  const studyMaterialA = await prismaAdmin.studyMaterial.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      title: 'Material RLS Test — A',
      source_type: 'rich_text',
      rich_content: 'conteúdo original',
      publish_at: new Date(),
    },
  });
  studyMaterialAId = studyMaterialA.id;

  const studyMaterialVersionA = await prismaAdmin.studyMaterialVersion.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      study_material_id: studyMaterialAId,
      version: 1,
      title: 'Material RLS Test — A (versão anterior)',
      source_type: 'rich_text',
      rich_content: 'conteúdo antes da edição',
      publish_at: new Date(),
      tags: [],
      changed_by_user_id: userAccountAId,
    },
  });
  studyMaterialVersionAId = studyMaterialVersionA.id;

  const catA = await prismaAdmin.financialCategory.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Dízimo A',
      type: 'income',
    },
  });
  categoryAId = catA.id;

  const groupTypeA = await prismaAdmin.groupType.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Célula',
    },
  });

  await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Célula A',
      group_type_id: groupTypeA.id,
      leader_person_id: personAId,
    },
  });

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

  await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      email: `admin-b-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });

  // ── Sprint 11.2: escala de celebração + indisponibilidade (Tenant A) ──
  const ministryA = await prismaAdmin.ministry.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Louvor A (RLS)',
    },
  });
  ministryAId = ministryA.id;

  const profileA = await prismaAdmin.volunteerProfile.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      person_id: personAId,
      availability: {},
      skills: {},
    },
  });
  volunteerProfileAId = profileA.id;

  const schedA = await prismaAdmin.celebrationSchedule.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      celebration_instance_id: celebrationInstanceAId,
      status: 'published',
    },
  });
  celebrationScheduleAId = schedA.id;

  const celMinA = await prismaAdmin.celebrationMinistry.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      schedule_id: celebrationScheduleAId,
      ministry_id: ministryAId,
      slots: 2,
    },
  });
  celebrationMinistryAId = celMinA.id;

  const asgA = await prismaAdmin.celebrationAssignment.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      celebration_ministry_id: celebrationMinistryAId,
      volunteer_profile_id: volunteerProfileAId,
    },
  });
  celebrationAssignmentAId = asgA.id;

  const unavA = await prismaAdmin.volunteerUnavailability.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      volunteer_profile_id: volunteerProfileAId,
      reference_month: 1,
      reference_year: 2030,
      notes: 'viagem',
      dates: {
        create: [
          {
            tenant_id: tenantAId,
            congregation_id: congregationAId,
            date: new Date('2030-01-05'),
          },
        ],
      },
    },
    include: { dates: true },
  });
  unavailabilityAId = unavA.id;
  unavailabilityDateAId = unavA.dates[0].id;

  const tplA = await prismaAdmin.scheduleTemplate.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      name: 'Culto domingo A (RLS)',
      ministries: {
        create: [
          {
            tenant_id: tenantAId,
            congregation_id: congregationAId,
            ministry_id: ministryAId,
            slots: 3,
          },
        ],
      },
    },
    include: { ministries: true },
  });
  scheduleTemplateAId = tplA.id;
  scheduleTemplateMinistryAId = tplA.ministries[0].id;

  await prismaAdmin.person.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      full_name: 'Person B Attacker',
      classification: 'member',
      gender: 'male',
    },
  });

  await prismaAdmin.financialCategory.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      name: 'Dízimo B',
      type: 'income',
    },
  });

  // ── Contas com papel (congregação A-Main) ──────────────────────────────────
  // `role_assignments.role_code` é FK para `roles.code` com onDelete: Restrict,
  // então os papéis precisam existir. O bootstrap --seed já os cria; o upsert
  // aqui torna a suíte independente disso.
  for (const [code, name] of [
    ['tenant_admin', 'Admin Tenant'],
    ['admin_congregation', 'Admin Congregação'],
  ] as const) {
    await prismaAdmin.role.upsert({
      where: { code },
      update: {},
      create: { code, name },
    });
  }

  const tenantAdminUser = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      email: `tenant-admin-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  tenantAdminUserId = tenantAdminUser.id;

  const congAdminUser = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      email: `cong-admin-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  congAdminUserId = congAdminUser.id;

  await prismaAdmin.roleAssignment.createMany({
    data: [
      {
        tenant_id: tenantAId,
        congregation_id: congregationAId,
        user_account_id: tenantAdminUserId,
        role_code: 'tenant_admin',
      },
      {
        tenant_id: tenantAId,
        congregation_id: congregationAId,
        user_account_id: congAdminUserId,
        role_code: 'admin_congregation',
      },
    ],
  });
}, 60_000);

afterAll(async () => {
  // CelebrationMinistry -> Ministry usa onDelete: Restrict. A cascata a partir
  // de Tenant pode esbarrar nessa FK dependendo da ordem em que o Postgres
  // avalia as constraints, então removemos essas linhas explicitamente antes.
  const tenants = { tenant_id: { in: [tenantAId, tenantBId] } };
  await prismaAdmin.roleAssignment.deleteMany({ where: tenants });
  await prismaAdmin.celebrationAssignment.deleteMany({ where: tenants });
  await prismaAdmin.celebrationMinistry.deleteMany({ where: tenants });
  await prismaAdmin.celebrationSchedule.deleteMany({ where: tenants });
  await prismaAdmin.scheduleTemplateMinistry.deleteMany({ where: tenants });
  await prismaAdmin.scheduleTemplate.deleteMany({ where: tenants });

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
// 4b. O ramo administrativo da policy
//
// `tenant_congregation_isolation` libera leitura cross-congregação para quem
// tem `tenant_admin`:
//
//   USING (tenant_id = app_current_tenant()
//          AND (congregation_id = app_current_congregation()
//               OR app_has_role('tenant_admin')
//               OR app_has_role('denomination_admin')))
//
// `app_has_role()` resolve o usuário por `app.user_id`. Como `runAsTenant` e
// `runAsTenantWithRole` não setam essa chave, os blocos 1–4 exercitam apenas o
// ramo estrito. Estes três testes cobrem o outro ramo — nos dois sentidos.
// ─────────────────────────────────────────────────────────────────────────────
describe('4b. Ramo administrativo — app_has_role', () => {
  it('tenant_admin na A-Main LÊ pessoa da A-Second (exceção da policy)', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, tenantAdminUserId, (tx) =>
      tx.person.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    expect(rows.map((r) => r.id)).toContain(personA2Id);
  });

  it('admin_congregation na A-Main NÃO lê pessoa da A-Second', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, congAdminUserId, (tx) =>
      tx.person.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    const leaked = rows.filter((r) => r.congregation_id === congregationA2Id).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: admin_congregation enxergou ${leaked} pessoa(s) de congregação irmã. ` +
          'A exceção da policy deveria valer só para tenant_admin.',
      );
    }
    expect(leaked).toBe(0);
  });

  it('tenant_admin na A-Main ATUALIZA pessoa da A-Second', async () => {
    // O `WITH CHECK` da policy não repete a exceção de papel que o `USING`
    // tem. Num UPDATE o Postgres avalia os dois — `USING` na linha antiga,
    // `WITH CHECK` na nova — então, sem a exceção nos dois lados, o
    // tenant_admin lê a linha e falha ao gravar com 42501. Este teste é o que
    // prova que leitura e escrita andam juntas.
    await runAsUser(tenantAId, congregationAId, tenantAdminUserId, (tx) =>
      tx.person.update({
        where: { id: personA2Id },
        data: { full_name: 'Person A Second Cong (editada pelo tenant_admin)' },
      }),
    );

    const after = await prismaAdmin.person.findUniqueOrThrow({ where: { id: personA2Id } });
    expect(after.full_name).toBe('Person A Second Cong (editada pelo tenant_admin)');
    expect(after.congregation_id).toBe(congregationA2Id);
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

// ─────────────────────────────────────────────────────────────────────────────
// 14. CelebrationSchedule isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('14. Cross-tenant read — CelebrationSchedule', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A rows', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.celebrationSchedule.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} celebration_schedule record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A row by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.celebrationSchedule.findUnique({ where: { id: celebrationScheduleAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): celebration_schedule id=${celebrationScheduleAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. CelebrationMinistry isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('15. Cross-tenant read — CelebrationMinistry', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A rows', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.celebrationMinistry.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} celebration_ministry record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A row by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.celebrationMinistry.findUnique({ where: { id: celebrationMinistryAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): celebration_ministry id=${celebrationMinistryAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. CelebrationAssignment isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('16. Cross-tenant read — CelebrationAssignment', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A rows', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.celebrationAssignment.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} celebration_assignment record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A row by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.celebrationAssignment.findUnique({ where: { id: celebrationAssignmentAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): celebration_assignment id=${celebrationAssignmentAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. VolunteerUnavailability isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('17. Cross-tenant read — VolunteerUnavailability', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A rows', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.volunteerUnavailability.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} volunteer_unavailability record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A row by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.volunteerUnavailability.findUnique({ where: { id: unavailabilityAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): volunteer_unavailability id=${unavailabilityAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. VolunteerUnavailabilityDate isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('18. Cross-tenant read — VolunteerUnavailabilityDate', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A rows', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.volunteerUnavailabilityDate.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} volunteer_unavailability_date record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A row by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.volunteerUnavailabilityDate.findUnique({ where: { id: unavailabilityDateAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): volunteer_unavailability_date id=${unavailabilityDateAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. ScheduleTemplate isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('19. Cross-tenant read — ScheduleTemplate', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A rows', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.scheduleTemplate.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} schedule_template record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A row by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.scheduleTemplate.findUnique({ where: { id: scheduleTemplateAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): schedule_template id=${scheduleTemplateAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. ScheduleTemplateMinistry isolation
// ─────────────────────────────────────────────────────────────────────────────

describe('20. Cross-tenant read — ScheduleTemplateMinistry', () => {
  it('app context (runAsTenant): Tenant B cannot see Tenant A rows', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.scheduleTemplateMinistry.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} schedule_template_ministry record(s) from Tenant A visible to Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B cannot fetch a Tenant A row by ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.scheduleTemplateMinistry.findUnique({ where: { id: scheduleTemplateMinistryAId } }),
    );
    if (row !== null) {
      console.error(
        `SECURITY GAP (app_user role): schedule_template_ministry id=${scheduleTemplateMinistryAId} from Tenant A ` +
          'is visible to Tenant B.',
      );
    }
    expect(row).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 21. Controle positivo — as fixtures do refactor de escalas existem mesmo
//
// Os testes 14-20 afirmam ausência ("Tenant B não vê"). Eles passariam
// trivialmente se as fixtures não tivessem sido criadas. Este bloco garante
// que há o que vazar: do contexto do próprio Tenant A, todas as linhas são
// visíveis.
// ─────────────────────────────────────────────────────────────────────────────

describe('21. Positive control — Tenant A sees its own schedule rows', () => {
  it('app_user role: cada fixture do refactor é visível para o próprio tenant', async () => {
    const found = await runAsTenantWithRole(tenantAId, congregationAId, async (tx) => ({
      schedule: await tx.celebrationSchedule.findUnique({ where: { id: celebrationScheduleAId } }),
      ministry: await tx.celebrationMinistry.findUnique({ where: { id: celebrationMinistryAId } }),
      assignment: await tx.celebrationAssignment.findUnique({
        where: { id: celebrationAssignmentAId },
      }),
      unavailability: await tx.volunteerUnavailability.findUnique({
        where: { id: unavailabilityAId },
      }),
      unavailabilityDate: await tx.volunteerUnavailabilityDate.findUnique({
        where: { id: unavailabilityDateAId },
      }),
      template: await tx.scheduleTemplate.findUnique({ where: { id: scheduleTemplateAId } }),
      templateMinistry: await tx.scheduleTemplateMinistry.findUnique({
        where: { id: scheduleTemplateMinistryAId },
      }),
    }));

    const missing = Object.entries(found)
      .filter(([, v]) => v === null)
      .map(([k]) => k);

    if (missing.length > 0) {
      console.error(
        `TESTE INVÁLIDO: fixtures ausentes (${missing.join(', ')}). Os testes 14-20 ` +
          'estariam passando por vacuidade, não por isolamento.',
      );
    }
    expect(missing).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 22. `login_attempts` — a conexão da aplicação não alcança a tabela.
//
// A tabela do limitador tem ENABLE + FORCE ROW LEVEL SECURITY e **nenhuma
// policy**, o mesmo desenho de `password_reset_tokens`: negação por ausência.
// Ela guarda o e-mail tentado, e essa lista não deve estar ao alcance de rota
// autenticada nenhuma — nem da própria, que roda como `orbien_app`/`app_user`.
//
// Quem escreve nela é `prisma.system`, pela conexão direta com BYPASSRLS. É o
// controle positivo abaixo: se `prismaAdmin` também não enxergasse, o teste
// estaria passando por vacuidade, e não por isolamento.
// ─────────────────────────────────────────────────────────────────────────────

describe('22. login_attempts — fechada para a conexão da aplicação', () => {
  const identifier = `rls-test:${Date.now()}@example.com`;

  beforeAll(async () => {
    await prismaAdmin.loginAttempt.create({
      data: { identifier, count: 1, window_at: new Date() },
    });
  });

  afterAll(async () => {
    await prismaAdmin.loginAttempt.deleteMany({ where: { identifier } });
  });

  it('controle positivo: a linha existe, vista pela conexão direta', async () => {
    const row = await prismaAdmin.loginAttempt.findUnique({ where: { identifier } });
    expect(row).not.toBeNull();
  });

  it('app context (runAsTenant): a linha não aparece', async () => {
    const rows = await runAsTenant(tenantAId, congregationAId, (tx) =>
      tx.loginAttempt.findMany({ where: { identifier } }),
    );
    expect(rows).toEqual([]);
  });

  it('app_user role: a linha não aparece, e a escrita é negada', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congregationAId, (tx) =>
      tx.loginAttempt.findMany({ where: { identifier } }),
    );
    expect(rows).toEqual([]);

    await expect(
      runAsTenantWithRole(tenantAId, congregationAId, (tx) =>
        tx.loginAttempt.create({
          data: { identifier: `${identifier}:forjado`, count: 1, window_at: new Date() },
        }),
      ),
    ).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 23. Songs — isolamento por congregação (AD-001, feature repertorio-louvor)
//
// `007_rls_songs.sql` escreve a policy usando `app_congregation_allowed()`
// diretamente nos dois lados desde a primeira versão (AD-001, .specs/STATE.md).
// Este bloco prova o comportamento nos dois sentidos: `admin_congregation` da
// A-Main não lê/escreve música da A-Second; `tenant_admin` sem congregação
// fixada lê e escreve em qualquer congregação do tenant, com USING e WITH
// CHECK simétricos (o mesmo par de exceções já exercitado no bloco 4b para
// `persons`).
// ─────────────────────────────────────────────────────────────────────────────
describe('23. Songs — isolamento por congregação (AD-001)', () => {
  it('app context (runAsTenant): Tenant B não vê músicas do catálogo do Tenant A', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.song.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} música(s) do catálogo do Tenant A visível(is) para o Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('tenant_admin na A-Main LÊ música do catálogo da A-Second (exceção da policy)', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, tenantAdminUserId, (tx) =>
      tx.song.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    expect(rows.map((r) => r.id)).toContain(songA2Id);
  });

  it('admin_congregation na A-Main NÃO lê música do catálogo da A-Second', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, congAdminUserId, (tx) =>
      tx.song.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    const leaked = rows.filter((r) => r.congregation_id === congregationA2Id).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: admin_congregation enxergou ${leaked} música(s) de congregação irmã. ` +
          'A exceção da policy deveria valer só para tenant_admin.',
      );
    }
    expect(leaked).toBe(0);
  });

  it('tenant_admin na A-Main ATUALIZA música do catálogo da A-Second (USING = WITH CHECK)', async () => {
    // Igual ao bloco 4b para persons: sem a mesma exceção nos dois lados, o
    // tenant_admin leria a linha e falharia ao gravar com 42501 — é isso que
    // `app_congregation_allowed()` nos dois lados (AD-001) evita desde a
    // primeira versão do script, sem precisar do ciclo criar-errado→corrigir
    // que 002/003 tiveram.
    await runAsUser(tenantAId, congregationAId, tenantAdminUserId, (tx) =>
      tx.song.update({
        where: { id: songA2Id },
        data: { title: 'Música RLS Test — A-Second (editada pelo tenant_admin)' },
      }),
    );

    const after = await prismaAdmin.song.findUniqueOrThrow({ where: { id: songA2Id } });
    expect(after.title).toBe('Música RLS Test — A-Second (editada pelo tenant_admin)');
    expect(after.congregation_id).toBe(congregationA2Id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 24. NotificationPreference — isolamento por congregação (AD-001, MOB-10)
//
// `008_rls_notification_preferences.sql` escreve a policy usando
// `app_congregation_allowed()` diretamente nos dois lados (AD-001,
// .specs/STATE.md) — o mesmo template de `007_rls_songs.sql` (bloco 23).
//
// SPEC_DEVIATION: `tasks.md` (T3) descreve "congregação irmã não lê nem
// escreve, nem com tenant_admin, que aqui não tem exceção". Isso não é
// possível mantendo AD-001: `app_congregation_allowed()` é uma função única,
// compartilhada por toda tabela nova de congregação, e seu corpo
// (`003_rls_admin_write.sql`) inclui `OR app_has_role('tenant_admin')`
// incondicionalmente — não há parâmetro por tabela para desligar essa
// exceção sem reintroduzir o padrão pré-003 que AD-001 proíbe explicitamente
// ("nunca o padrão antigo"). T2 (já commitada) usa o template de `007` ao
// pé da letra, como a própria task manda em "Reuses". Este bloco testa o
// comportamento real e correto por AD-001 — idêntico ao bloco 23 — em vez da
// frase da task, que está em contradição com a decisão registrada em
// STATE.md. `admin_congregation` (sem o papel `tenant_admin`) continua sem
// nenhuma exceção, exatamente como em Songs.
// ─────────────────────────────────────────────────────────────────────────────
describe('24. NotificationPreference — isolamento por congregação (AD-001)', () => {
  it('app context (runAsTenant): Tenant B não vê notification_preferences do Tenant A', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.notificationPreference.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} notification_preference(s) do Tenant A visível(is) para o Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('a própria conta, no próprio tenant/congregação, lê a própria preferência', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, userAccountAId, (tx) =>
      tx.notificationPreference.findMany({ where: { user_account_id: userAccountAId } }),
    );
    expect(rows.map((r) => r.id)).toContain(notifPrefAId);
  });

  it('a própria conta, no próprio tenant/congregação, escreve a própria preferência', async () => {
    await runAsUser(tenantAId, congregationAId, userAccountAId, (tx) =>
      tx.notificationPreference.update({
        where: { id: notifPrefAId },
        data: { oracao: false },
      }),
    );

    const after = await prismaAdmin.notificationPreference.findUniqueOrThrow({
      where: { id: notifPrefAId },
    });
    expect(after.oracao).toBe(false);
  });

  it('tenant_admin na A-Main LÊ notification_preference da A-Second (exceção da policy, AD-001)', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, tenantAdminUserId, (tx) =>
      tx.notificationPreference.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    expect(rows.map((r) => r.id)).toContain(notifPrefA2Id);
  });

  it('admin_congregation na A-Main NÃO lê notification_preference da A-Second', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, congAdminUserId, (tx) =>
      tx.notificationPreference.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    const leaked = rows.filter((r) => r.congregation_id === congregationA2Id).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: admin_congregation enxergou ${leaked} notification_preference(s) de congregação irmã. ` +
          'A exceção da policy deveria valer só para tenant_admin.',
      );
    }
    expect(leaked).toBe(0);
  });

  it('admin_congregation na A-Main NÃO escreve notification_preference da A-Second', async () => {
    await expect(
      runAsUser(tenantAId, congregationAId, congAdminUserId, (tx) =>
        tx.notificationPreference.update({
          where: { id: notifPrefA2Id },
          data: { eventos: false },
        }),
      ),
    ).rejects.toThrow();

    const after = await prismaAdmin.notificationPreference.findUniqueOrThrow({
      where: { id: notifPrefA2Id },
    });
    expect(after.eventos).toBe(true);
  });

  it('tenant_admin na A-Main ATUALIZA notification_preference da A-Second (USING = WITH CHECK)', async () => {
    // Igual ao bloco 23 para Songs: sem a mesma exceção nos dois lados, o
    // tenant_admin leria a linha e falharia ao gravar com 42501 — é isso que
    // `app_congregation_allowed()` nos dois lados (AD-001) evita.
    await runAsUser(tenantAId, congregationAId, tenantAdminUserId, (tx) =>
      tx.notificationPreference.update({
        where: { id: notifPrefA2Id },
        data: { avisos: false },
      }),
    );

    const after = await prismaAdmin.notificationPreference.findUniqueOrThrow({
      where: { id: notifPrefA2Id },
    });
    expect(after.avisos).toBe(false);
    expect(after.congregation_id).toBe(congregationA2Id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 25. PrayerRequest — isolamento por congregação (AD-001, PROD-01)
//
// Caso oposto ao dos blocos 23 e 24: `prayer_requests` é tabela antiga, que
// nasceu em `001` só com `tenant_isolation` porque nenhuma rota a usava. Com a
// feature no ar, `009_rls_prayer_requests.sql` troca pela policy de
// congregação, com `app_congregation_allowed()` nos dois lados. O conteúdo é
// dado de saúde, família e conflito — congregação irmã do mesmo tenant não
// pode ler. O `tenant_admin` mantém a exceção da função, como em Songs.
// ─────────────────────────────────────────────────────────────────────────────
describe('25. PrayerRequest — isolamento por congregação (AD-001)', () => {
  it('app context (runAsTenant): Tenant B não vê pedido de oração do Tenant A', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.prayerRequest.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = rows.filter((r) => r.tenant_id === tenantAId).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: ${leaked} pedido(s) de oração do Tenant A visível(is) para o Tenant B.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('admin_congregation na A-Main NÃO lê pedido de oração da A-Second', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, congAdminUserId, (tx) =>
      tx.prayerRequest.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    const leaked = rows.filter((r) => r.congregation_id === congregationA2Id).length;
    if (leaked > 0) {
      console.error(
        `SECURITY GAP: admin_congregation enxergou ${leaked} pedido(s) de oração de congregação irmã.`,
      );
    }
    expect(leaked).toBe(0);
  });

  it('tenant_admin na A-Main LÊ pedido de oração da A-Second (exceção da policy)', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, tenantAdminUserId, (tx) =>
      tx.prayerRequest.findMany({ where: { congregation_id: congregationA2Id } }),
    );
    expect(rows.map((r) => r.id)).toContain(prayerRequestA2Id);
  });

  it('tenant_admin na A-Main ATUALIZA pedido da A-Second (USING = WITH CHECK)', async () => {
    await runAsUser(tenantAId, congregationAId, tenantAdminUserId, (tx) =>
      tx.prayerRequest.update({
        where: { id: prayerRequestA2Id },
        data: { content: 'Pedido RLS Test — A-Second (editado pelo tenant_admin)' },
      }),
    );

    const after = await prismaAdmin.prayerRequest.findUniqueOrThrow({
      where: { id: prayerRequestA2Id },
    });
    expect(after.content).toBe('Pedido RLS Test — A-Second (editado pelo tenant_admin)');
    expect(after.congregation_id).toBe(congregationA2Id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 26. Cross-tenant read — StudyMaterialVersion (PROD-10)
//
// Padrão B simples (tenant_isolation, sem exceção de congregação), copiado da
// policy de group_meeting_materials — guarda snapshot de conteúdo do material
// de estudo, então mora aqui pela mesma razão que o material original.
// ─────────────────────────────────────────────────────────────────────────────
describe('26. Cross-tenant read — StudyMaterialVersion (PROD-10)', () => {
  it('app context (runAsTenant): Tenant B não vê versões de material do Tenant A', async () => {
    const rows = await runAsTenant(tenantBId, congregationBId, (tx) =>
      tx.studyMaterialVersion.findMany({ where: { tenant_id: tenantAId } }),
    );
    const leaked = await countVisibleFromB(rows);
    if (leaked > 0) {
      console.error(`SECURITY GAP: ${leaked} study_material_version(s) vazaram para o Tenant B.`);
    }
    expect(leaked).toBe(0);
  });

  it('app_user role: Tenant B não consegue buscar versão do Tenant A por ID', async () => {
    const row = await runAsTenantWithRole(tenantBId, congregationBId, (tx) =>
      tx.studyMaterialVersion.findUnique({ where: { id: studyMaterialVersionAId } }),
    );
    expect(row).toBeNull();
  });
});
