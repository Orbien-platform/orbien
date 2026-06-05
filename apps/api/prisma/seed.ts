import { PrismaClient, PlanType, PlanStatus, PersonClassification } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const ROLES: { code: string; name: string }[] = [
  { code: 'platform_support',  name: 'Platform Support'      },
  { code: 'tenant_admin',      name: 'Admin Tenant'           },
  { code: 'admin_congregation', name: 'Admin Congregação'     },
  { code: 'pastor',            name: 'Pastor'                 },
  { code: 'secretary',         name: 'Secretário'             },
  { code: 'treasurer',         name: 'Tesoureiro'             },
  { code: 'cell_leader',       name: 'Líder de Célula'        },
  { code: 'ministry_leader',   name: 'Líder de Ministério'    },
  { code: 'volunteer',         name: 'Voluntário'             },
  { code: 'member',            name: 'Membro'                 },
];

async function main(): Promise<void> {
  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'doca-church' },
    update: {},
    create: { slug: 'doca-church', name: 'Doca Church' },
  });
  console.log(`tenant:           ${tenant.id}`);

  // ── 2. TenantPlan ──────────────────────────────────────────────────────────
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 30);

  await prisma.tenantPlan.upsert({
    where: { tenant_id: tenant.id },
    update: {},
    create: {
      tenant_id: tenant.id,
      plan: PlanType.premium,
      status: PlanStatus.trial,
      trial_ends_at: trialEndsAt,
    },
  });
  console.log('tenant_plan:      ok');

  // ── 3. BrandingConfig ──────────────────────────────────────────────────────
  await prisma.brandingConfig.upsert({
    where: { tenant_id: tenant.id },
    update: {},
    create: {
      tenant_id: tenant.id,
      primary_color: '#1E3A7B',
      secondary_color: '#00B8A2',
      app_name: 'Doca Church',
    },
  });
  console.log('branding_config:  ok');

  // ── 4. Congregation ────────────────────────────────────────────────────────
  // No unique constraint on name — use findFirst to stay idempotent
  let congregation = await prisma.congregation.findFirst({
    where: { tenant_id: tenant.id, name: 'Doca Church - Passo Fundo' },
  });

  if (!congregation) {
    congregation = await prisma.congregation.create({
      data: {
        tenant_id: tenant.id,
        name: 'Doca Church - Passo Fundo',
        timezone: 'America/Sao_Paulo',
      },
    });
  }
  console.log(`congregation:     ${congregation.id}`);

  // ── 5. Roles (global reference table) ─────────────────────────────────────
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {},
      create: role,
    });
  }
  console.log(`roles:            ${ROLES.map((r) => r.code).join(', ')}`);

  // ── 6. UserAccounts ────────────────────────────────────────────────────────
  const PASSWORD = 'A3dodfemf';

  const supportUser = await prisma.userAccount.upsert({
    where: {
      tenant_id_email: { tenant_id: tenant.id, email: 'fernando.vargas@fill.tech' },
    },
    update: {},
    create: {
      tenant_id: tenant.id,
      congregation_id: congregation.id,
      email: 'fernando.vargas@fill.tech',
      password_hash: await argon2.hash(PASSWORD),
    },
  });
  console.log(`user support:     ${supportUser.id}`);

  const adminUser = await prisma.userAccount.upsert({
    where: {
      tenant_id_email: { tenant_id: tenant.id, email: 'fvargaspf@gmail.com' },
    },
    update: {},
    create: {
      tenant_id: tenant.id,
      congregation_id: congregation.id,
      email: 'fvargaspf@gmail.com',
      password_hash: await argon2.hash(PASSWORD),
    },
  });
  console.log(`user admin:       ${adminUser.id}`);

  // ── 6b. Persons linked to UserAccounts ────────────────────────────────────
  // Idempotent: skip creation if account already has a valid person_id
  async function ensurePersonForAccount(
    account: { id: string; person_id: string | null },
    email: string,
  ): Promise<string> {
    if (account.person_id) {
      const existing = await prisma.person.findUnique({
        where: { id: account.person_id },
        select: { id: true },
      });
      if (existing) return existing.id;
    }

    let person = await prisma.person.findFirst({
      where: { tenant_id: tenant.id, email },
      select: { id: true },
    });

    if (!person) {
      person = await prisma.person.create({
        data: {
          tenant_id: tenant.id,
          congregation_id: congregation!.id,
          full_name: 'Fernando Vargas',
          email,
          classification: PersonClassification.member,
        },
        select: { id: true },
      });
    }

    await prisma.userAccount.update({
      where: { id: account.id },
      data: { person_id: person.id },
    });

    return person.id;
  }

  const supportPersonId = await ensurePersonForAccount(supportUser, 'fernando.vargas@fill.tech');
  console.log(`person support:   ${supportPersonId}`);

  const adminPersonId = await ensurePersonForAccount(adminUser, 'fvargaspf@gmail.com');
  console.log(`person admin:     ${adminPersonId}`);

  // ── 7. RoleAssignments ─────────────────────────────────────────────────────
  // No unique constraint — guard with findFirst
  const assignments: { userId: string; roleCode: string; label: string }[] = [
    { userId: supportUser.id, roleCode: 'platform_support', label: 'support → platform_support' },
    { userId: adminUser.id,   roleCode: 'tenant_admin',     label: 'admin   → tenant_admin'     },
  ];

  for (const { userId, roleCode, label } of assignments) {
    const exists = await prisma.roleAssignment.findFirst({
      where: { user_account_id: userId, role_code: roleCode, tenant_id: tenant.id },
    });

    if (!exists) {
      await prisma.roleAssignment.create({
        data: {
          tenant_id: tenant.id,
          congregation_id: congregation.id,
          user_account_id: userId,
          role_code: roleCode,
        },
      });
    }
    console.log(`role_assignment:  ${label}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
