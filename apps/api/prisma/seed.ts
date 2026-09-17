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

const DEFAULT_CATEGORIES: { name: string; type: FinancialCategoryType }[] = [
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

/**
 * Senha de todas as contas do seed.
 *
 * Não é segredo e não deve virar um: só vale no banco efêmero do CI e no
 * Postgres local. As contas de produção — inclusive as dos tenants de teste —
 * têm senha própria, definida na hora de provisionar. Ver `docs/AMBIENTES.md`.
 */
const PASSWORD = 'A3dodfemf';

/**
 * Um tenant completo do seed.
 *
 * `doca-church` é o tenant de trabalho (cliente zero). `teste1-church` e
 * `teste2-church` existem **só para teste** — e são os únicos que podem ser
 * usados para isso, em qualquer ambiente, inclusive produção. A regra está em
 * `/CLAUDE.md` e em `docs/AMBIENTES.md`; aqui ela aparece no fato de os dois
 * nascerem prontos para a suíte de e2e, com celebração, ministério e
 * voluntários — para que nenhum teste precise procurar dado em outro tenant.
 */
interface TenantSpec {
  slug: string;
  name: string;
  congregationName: string;
  /** Conta `tenant_admin` do tenant — é por ela que o e2e entra. */
  admin: { email: string; fullName: string };
  /** Papéis extras da conta admin, além de `tenant_admin`. */
  extraAdminRoles?: string[];
}

const TENANTS: TenantSpec[] = [
  {
    slug: 'doca-church',
    name: 'Doca Church',
    congregationName: 'Doca Church - Passo Fundo',
    // `platform_support` aqui é deliberado: esta conta administra a plataforma
    // inteira **e** é a dona do tenant do cliente zero. O papel é global por
    // definição (`app_is_platform_support()` não filtra por tenant nem por
    // congregação), e `rolesForToken()` o mantém no token mesmo quando a
    // atribuição está em outra congregação. O tenant de origem continua no
    // token de propósito: é ele que o `AuditInterceptor` grava em
    // `audit_logs.tenant_id`, que é NOT NULL com FK.
    admin: { email: 'fvargaspf@gmail.com', fullName: 'Fernando Vargas' },
    extraAdminRoles: ['platform_support'],
  },
  {
    slug: 'teste1-church',
    name: 'Teste 1 Church',
    congregationName: 'Teste 1 - Sede',
    admin: { email: 'teste1@useorbien.com.br', fullName: 'Conta de Teste 1' },
  },
  {
    slug: 'teste2-church',
    name: 'Teste 2 Church',
    congregationName: 'Teste 2 - Sede',
    admin: { email: 'teste2@useorbien.com.br', fullName: 'Conta de Teste 2' },
  },
];

/**
 * Segunda conta de plataforma, fora da lista de tenants.
 *
 * Existe como quebra-vidro: se o papel da conta principal cair por engano, o
 * console ainda tem por onde entrar. Mora no `doca-church` porque
 * `user_accounts.tenant_id` é NOT NULL — mas não é conta operacional da
 * igreja, e é por isso que não aparece em `TENANTS`.
 */
const PLATFORM_BREAKGLASS = { email: 'fernando.vargas@fill.tech', fullName: 'Fernando Vargas' };

interface SeededTenant {
  tenantId: string;
  congregationId: string;
  adminUserId: string;
  adminPersonId: string;
}

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
  console.log(`  group_types:      ${DEFAULT_GROUP_TYPES.map((g) => g.name).join(', ')}`);
}

/**
 * Garante a `Person` de uma conta e liga as duas.
 *
 * Idempotente por dois caminhos: a conta já apontar para uma pessoa que
 * existe, ou já haver pessoa com aquele e-mail no tenant.
 */
async function ensurePersonForAccount(
  account: { id: string; person_id: string | null },
  tenantId: string,
  congregationId: string,
  email: string,
  fullName: string,
): Promise<string> {
  if (account.person_id) {
    const existing = await prisma.person.findUnique({
      where: { id: account.person_id },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  let person = await prisma.person.findFirst({
    where: { tenant_id: tenantId, email },
    select: { id: true },
  });

  if (!person) {
    person = await prisma.person.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        full_name: fullName,
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

/** Atribui um papel a uma conta sem duplicar — não há unique na tabela. */
async function ensureRoleAssignment(
  tenantId: string,
  congregationId: string,
  userAccountId: string,
  roleCode: string,
): Promise<void> {
  const exists = await prisma.roleAssignment.findFirst({
    where: { user_account_id: userAccountId, role_code: roleCode, tenant_id: tenantId },
  });
  if (!exists) {
    await prisma.roleAssignment.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        user_account_id: userAccountId,
        role_code: roleCode,
      },
    });
  }
  console.log(`  role_assignment:  ${roleCode}`);
}

/**
 * Cria (ou reaproveita) um tenant inteiro: plano, branding, congregação, tipos
 * de grupo, conta admin com pessoa e papéis, plano de contas, e o mínimo que a
 * suíte de e2e precisa — celebração, ministério e voluntários.
 *
 * Idempotente de ponta a ponta: rodar duas vezes não duplica nada. Quem muda o
 * conjunto de tenants mexe em `TENANTS`, não aqui.
 */
async function seedTenant(spec: TenantSpec): Promise<SeededTenant> {
  console.log(`\n── ${spec.slug} ──────────────────────────────────────`);

  const tenant = await prisma.tenant.upsert({
    where: { slug: spec.slug },
    update: {},
    create: { slug: spec.slug, name: spec.name },
  });
  console.log(`  tenant:           ${tenant.id}`);

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
  console.log('  tenant_plan:      ok');

  await prisma.brandingConfig.upsert({
    where: { tenant_id: tenant.id },
    update: { pix_key: '12345678900' },
    create: {
      tenant_id: tenant.id,
      primary_color: '#1E3A7B',
      secondary_color: '#00B8A2',
      app_name: spec.name,
      pix_key: '12345678900',
    },
  });
  console.log('  branding_config:  ok');

  // Sem unique em `name` — findFirst é o que mantém a idempotência.
  let congregation = await prisma.congregation.findFirst({
    where: { tenant_id: tenant.id, name: spec.congregationName },
  });
  if (!congregation) {
    congregation = await prisma.congregation.create({
      data: {
        tenant_id: tenant.id,
        name: spec.congregationName,
        timezone: 'America/Sao_Paulo',
      },
    });
  }
  console.log(`  congregation:     ${congregation.id}`);

  await seedGroupTypes(tenant.id, congregation.id);

  const adminUser = await prisma.userAccount.upsert({
    where: { email: spec.admin.email },
    update: {},
    create: {
      tenant_id: tenant.id,
      congregation_id: congregation.id,
      email: spec.admin.email,
      password_hash: await argon2.hash(PASSWORD),
    },
  });
  console.log(`  user admin:       ${adminUser.id} (${spec.admin.email})`);

  const adminPersonId = await ensurePersonForAccount(
    adminUser,
    tenant.id,
    congregation.id,
    spec.admin.email,
    spec.admin.fullName,
  );
  console.log(`  person admin:     ${adminPersonId}`);

  for (const roleCode of ['tenant_admin', ...(spec.extraAdminRoles ?? [])]) {
    await ensureRoleAssignment(tenant.id, congregation.id, adminUser.id, roleCode);
  }

  for (const cat of DEFAULT_CATEGORIES) {
    const exists = await prisma.financialCategory.findFirst({
      where: {
        tenant_id: tenant.id,
        congregation_id: congregation.id,
        name: cat.name,
        type: cat.type,
      },
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
  }
  console.log(`  categories:       ${DEFAULT_CATEGORIES.length} (sistema)`);

  // ── Mínimo para a suíte de e2e ────────────────────────────────────────────
  // Uma celebração (de onde a fixture cria a instância), um ministério (para o
  // seletor de template) e voluntários vinculados a ele (para o seletor de
  // disponibilidade). Sem isso os specs falham por falta de dado, antes de
  // tocar a tela — foi o que aconteceu no primeiro run de CI. Vale para os
  // três tenants: os de teste são justamente os que o e2e exercita.
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
  console.log(`  celebration:      ${celebration.id}`);

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
  console.log(`  ministry:         ${ministry.id}`);

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
    console.log(`  volunteer:        ${v.name} (${v.role})`);
  }

  // A conta admin também precisa de perfil de voluntário: a aba
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
  console.log('  volunteer:        conta admin (perfil para a aba de indisponibilidade)');

  return {
    tenantId: tenant.id,
    congregationId: congregation.id,
    adminUserId: adminUser.id,
    adminPersonId,
  };
}

async function main(): Promise<void> {
  // `roles` é tabela de referência global — semeada uma vez, antes dos
  // tenants, porque `role_assignments` tem FK para ela.
  for (const role of ROLES) {
    await prisma.role.upsert({ where: { code: role.code }, update: {}, create: role });
  }
  console.log(`roles:            ${ROLES.map((r) => r.code).join(', ')}`);

  const seeded = new Map<string, SeededTenant>();
  for (const spec of TENANTS) {
    seeded.set(spec.slug, await seedTenant(spec));
  }

  // ── Conta quebra-vidro da plataforma ──────────────────────────────────────
  const doca = seeded.get('doca-church');
  if (!doca) throw new Error("TENANTS precisa conter 'doca-church'.");

  const breakglass = await prisma.userAccount.upsert({
    where: { email: PLATFORM_BREAKGLASS.email },
    update: {},
    create: {
      tenant_id: doca.tenantId,
      congregation_id: doca.congregationId,
      email: PLATFORM_BREAKGLASS.email,
      password_hash: await argon2.hash(PASSWORD),
    },
  });
  const breakglassPersonId = await ensurePersonForAccount(
    breakglass,
    doca.tenantId,
    doca.congregationId,
    PLATFORM_BREAKGLASS.email,
    PLATFORM_BREAKGLASS.fullName,
  );
  console.log('\n── plataforma ────────────────────────────────────────');
  console.log(`  user breakglass:  ${breakglass.id} (${PLATFORM_BREAKGLASS.email})`);
  console.log(`  person:           ${breakglassPersonId}`);
  await ensureRoleAssignment(doca.tenantId, doca.congregationId, breakglass.id, 'platform_support');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
