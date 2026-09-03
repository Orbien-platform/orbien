import {
  PrismaClient,
  PlanType,
  PlanStatus,
  PersonClassification,
  FinancialCategoryType,
  CelebrationType,
  CelebrationRecurrence,
  VolunteerMinistryRole,
} from '@prisma/client';
import * as argon2 from 'argon2';

// Bypassa RLS (postgres/DIRECT_URL) — necessário pois o seed cria o próprio
// tenant/congregação, sem contexto de sessão (app.tenant_id) para satisfazer
// as políticas RLS das tabelas com FORCE ROW LEVEL SECURITY.
const prisma = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL'] } } });

const DEFAULT_GROUP_TYPES: { name: string; color: string }[] = [
  { name: 'Célula',         color: '#1E3A7B' },
  { name: 'Grupo de Casa',  color: '#0D9488' },
  { name: 'EBD',            color: '#7C3AED' },
  { name: 'Discipulado',    color: '#B91C1C' },
  { name: 'Jovens',         color: '#D97706' },
];

async function seedGroupTypes(tenantId: string, congregationId: string): Promise<void> {
  for (const groupType of DEFAULT_GROUP_TYPES) {
    const exists = await prisma.groupType.findFirst({
      where: { tenant_id: tenantId, congregation_id: congregationId, name: groupType.name },
      select: { id: true },
    });
    if (!exists) {
      await prisma.groupType.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          name: groupType.name,
          color: groupType.color,
        },
      });
    }
  }
  console.log(`group_types:      ${DEFAULT_GROUP_TYPES.map((g) => g.name).join(', ')}`);
}

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
    update: { pix_key: '12345678900' },
    create: {
      tenant_id: tenant.id,
      primary_color: '#1E3A7B',
      secondary_color: '#00B8A2',
      app_name: 'Doca Church',
      pix_key: '12345678900',
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

  // ── 4b. GroupTypes (padrão) ────────────────────────────────────────────────
  await seedGroupTypes(tenant.id, congregation.id);

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

  // ── 8. Financial Categories (sistema) ─────────────────────────────────────
  const defaultCategories: { name: string; type: FinancialCategoryType }[] = [
    { name: 'Dízimo',                type: FinancialCategoryType.income  },
    { name: 'Oferta',                type: FinancialCategoryType.income  },
    { name: 'Oferta Missionária',    type: FinancialCategoryType.income  },
    { name: 'Oferta de Construção',  type: FinancialCategoryType.income  },
    { name: 'Doação Especial',       type: FinancialCategoryType.income  },
    { name: 'Outros (Receita)',      type: FinancialCategoryType.income  },
    { name: 'Aluguel',               type: FinancialCategoryType.expense },
    { name: 'Água / Luz / Internet', type: FinancialCategoryType.expense },
    { name: 'Material de Limpeza',   type: FinancialCategoryType.expense },
    { name: 'Eventos',               type: FinancialCategoryType.expense },
    { name: 'Missões',               type: FinancialCategoryType.expense },
    { name: 'Outros (Despesa)',      type: FinancialCategoryType.expense },
  ];

  for (const cat of defaultCategories) {
    const exists = await prisma.financialCategory.findFirst({
      where: { tenant_id: tenant.id, congregation_id: congregation.id, name: cat.name, type: cat.type },
      select: { id: true },
    });
    if (!exists) {
      await prisma.financialCategory.create({
        data: {
          tenant_id: tenant.id,
          congregation_id: congregation.id,
          name: cat.name,
          type: cat.type,
          is_system: true,
        },
      });
    }
    console.log(`category:         ${cat.type} · ${cat.name}`);
  }

  // ── 9. Celebração, ministério e voluntários ───────────────────────────────
  // Mínimo que a suíte de e2e precisa para existir num banco provisionado do
  // zero: uma celebração (de onde a fixture cria a instância), um ministério
  // (para o seletor de template) e voluntários vinculados a ele (para o
  // seletor de disponibilidade). Sem isso os dois specs falham por falta de
  // dado, antes de tocar a tela — foi o que aconteceu no primeiro run de CI.

  let celebration = await prisma.celebration.findFirst({
    where: { tenant_id: tenant.id, congregation_id: congregation.id, name: 'Culto de Domingo' },
    select: { id: true },
  });
  if (!celebration) {
    celebration = await prisma.celebration.create({
      data: {
        tenant_id: tenant.id,
        congregation_id: congregation.id,
        name: 'Culto de Domingo',
        type: CelebrationType.sunday_service,
        day_of_week: 0,
        start_time: '10:00',
        recurrence: CelebrationRecurrence.weekly,
      },
      select: { id: true },
    });
  }
  console.log(`celebration:      ${celebration.id}`);

  let ministry = await prisma.ministry.findFirst({
    where: { tenant_id: tenant.id, congregation_id: congregation.id, name: 'Louvor' },
    select: { id: true },
  });
  if (!ministry) {
    ministry = await prisma.ministry.create({
      data: {
        tenant_id: tenant.id,
        congregation_id: congregation.id,
        name: 'Louvor',
        description: 'Equipe de música e adoração',
      },
      select: { id: true },
    });
  }
  console.log(`ministry:         ${ministry.id}`);

  // Dois voluntários: um líder e um comum. O seletor de disponibilidade
  // distingue os dois, então ter os dois papéis cobre o caso real.
  const volunteers: { name: string; role: VolunteerMinistryRole }[] = [
    { name: 'Carlos Pereira',  role: VolunteerMinistryRole.leader },
    { name: 'Maria Rodrigues', role: VolunteerMinistryRole.volunteer },
  ];

  for (const v of volunteers) {
    let person = await prisma.person.findFirst({
      where: { tenant_id: tenant.id, congregation_id: congregation.id, full_name: v.name },
      select: { id: true },
    });
    if (!person) {
      person = await prisma.person.create({
        data: {
          tenant_id: tenant.id,
          congregation_id: congregation.id,
          full_name: v.name,
          classification: PersonClassification.member,
        },
        select: { id: true },
      });
    }

    let profile = await prisma.volunteerProfile.findFirst({
      where: { person_id: person.id },
      select: { id: true },
    });
    if (!profile) {
      profile = await prisma.volunteerProfile.create({
        data: {
          tenant_id: tenant.id,
          congregation_id: congregation.id,
          person_id: person.id,
          availability: {},
          skills: {},
        },
        select: { id: true },
      });
    }

    const link = await prisma.volunteerMinistry.findUnique({
      where: {
        volunteer_profile_id_ministry_id: {
          volunteer_profile_id: profile.id,
          ministry_id: ministry.id,
        },
      },
      select: { id: true },
    });
    if (!link) {
      await prisma.volunteerMinistry.create({
        data: {
          tenant_id: tenant.id,
          congregation_id: congregation.id,
          volunteer_profile_id: profile.id,
          ministry_id: ministry.id,
          role: v.role,
          is_primary_leader: v.role === VolunteerMinistryRole.leader,
        },
      });
    }
    console.log(`volunteer:        ${v.name} (${v.role})`);
  }

  // O usuário admin também precisa de perfil de voluntário: a aba
  // "Indisponibilidade" é visível para qualquer usuário logado, e
  // UnavailabilityService.resolveProfile lança 404 para quem não tem perfil.
  // Sem isto, a tela abre com erro para a própria conta que o e2e usa.
  let adminProfile = await prisma.volunteerProfile.findFirst({
    where: { person_id: adminPersonId },
    select: { id: true },
  });
  if (!adminProfile) {
    adminProfile = await prisma.volunteerProfile.create({
      data: {
        tenant_id: tenant.id,
        congregation_id: congregation.id,
        person_id: adminPersonId,
        availability: {},
        skills: {},
      },
      select: { id: true },
    });
  }

  const adminLink = await prisma.volunteerMinistry.findUnique({
    where: {
      volunteer_profile_id_ministry_id: {
        volunteer_profile_id: adminProfile.id,
        ministry_id: ministry.id,
      },
    },
    select: { id: true },
  });
  if (!adminLink) {
    await prisma.volunteerMinistry.create({
      data: {
        tenant_id: tenant.id,
        congregation_id: congregation.id,
        volunteer_profile_id: adminProfile.id,
        ministry_id: ministry.id,
        role: VolunteerMinistryRole.volunteer,
      },
    });
  }
  console.log(`volunteer:        conta admin (perfil para a aba de indisponibilidade)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
