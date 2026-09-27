import {
  PrismaClient,
  PlanType,
  PlanStatus,
  PersonClassification,
  FinancialCategoryType,
  CelebrationType,
  CelebrationRecurrence,
  VolunteerMinistryRole,
  Gender,
  MaritalStatus,
  HouseholdMemberRole,
  GroupMemberRole,
  StudyMaterialSource,
  TransactionType,
  TransactionSource,
  TransactionStatus,
  RecurringRuleMode,
  RecurringFrequency,
  PixScenario,
  PixStatus,
  VisitOrigin,
  ContentPostType,
  EventRegistrationStatus,
  AudienceSegmentType,
  NotificationChannel,
  NotificationStatus,
  CelebrationInstanceStatus,
  ResponsibleType,
  ServiceOrderItemType,
  ScheduleStatus,
  AssignmentStatus,
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
  /** Plano do tenant. Default: `premium` (ver `seedTenant`). */
  plan?: PlanType;
  /**
   * Carrega dado de demonstração em todos os módulos (pessoas, pequenos
   * grupos, financeiro, conteúdo, voluntariado e celebrações) — não só o
   * mínimo que o e2e precisa. Só faz sentido nos tenants de teste: são os
   * únicos que servem tanto para teste quanto para demonstração (ver
   * `docs/AMBIENTES.md` §1).
   */
  demoData?: boolean;
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
    admin: { email: 'fvargaspf+teste1@gmail.com', fullName: 'Conta de Teste 1' },
    plan: PlanType.starter,
    demoData: true,
  },
  {
    slug: 'teste2-church',
    name: 'Teste 2 Church',
    congregationName: 'Teste 2 - Sede',
    admin: { email: 'fvargaspf+teste2@gmail.com', fullName: 'Conta de Teste 2' },
    plan: PlanType.premium,
    demoData: true,
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
  ministryId: string;
  celebrationId: string;
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

  const plan = spec.plan ?? PlanType.premium;
  await prisma.tenantPlan.upsert({
    where: { tenant_id: tenant.id },
    update: { plan },
    create: {
      tenant_id: tenant.id,
      plan,
      status: PlanStatus.trial,
      trial_ends_at: trialEndsAt,
    },
  });
  console.log(`  tenant_plan:      ok (${plan})`);

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
    ministryId: ministry.id,
    celebrationId: celebration.id,
  };
}

/**
 * Pessoas de demonstração: cobrem as três classificações e os campos que as
 * telas de perfil exibem. `Ana Souza` e `Bruno Lima` lideram os dois pequenos
 * grupos; os demais são membros/visitantes distribuídos entre eles.
 */
const DEMO_PERSONS: {
  key: string;
  full_name: string;
  classification: PersonClassification;
  gender: Gender;
  marital_status: MaritalStatus;
  phone: string;
  email?: string;
  profession?: string;
  birth_date: Date;
}[] = [
  { key: 'ana',       full_name: 'Ana Souza',        classification: PersonClassification.member,   gender: Gender.female, marital_status: MaritalStatus.married,   phone: '54999010001', profession: 'Professora',    birth_date: new Date('1985-03-12') },
  { key: 'bruno',     full_name: 'Bruno Lima',       classification: PersonClassification.member,   gender: Gender.male,   marital_status: MaritalStatus.single,    phone: '54999010002', profession: 'Analista de TI', birth_date: new Date('1990-07-24') },
  { key: 'carla',     full_name: 'Carla Mendes',     classification: PersonClassification.attendee, gender: Gender.female, marital_status: MaritalStatus.single,    phone: '54999010003', profession: 'Enfermeira',     birth_date: new Date('1994-11-02') },
  { key: 'diego',     full_name: 'Diego Alves',      classification: PersonClassification.visitor,  gender: Gender.male,   marital_status: MaritalStatus.single,    phone: '54999010004', birth_date: new Date('1998-01-19') },
  { key: 'elaine',    full_name: 'Elaine Costa',     classification: PersonClassification.member,   gender: Gender.female, marital_status: MaritalStatus.widowed,   phone: '54999010005', profession: 'Aposentada',     birth_date: new Date('1958-05-30') },
  { key: 'felipe',    full_name: 'Felipe Rocha',     classification: PersonClassification.member,   gender: Gender.male,   marital_status: MaritalStatus.married,   phone: '54999010006', profession: 'Engenheiro',     birth_date: new Date('1982-09-08'), email: 'felipe.rocha@example.com' },
  { key: 'gabriela',  full_name: 'Gabriela Dias',    classification: PersonClassification.attendee, gender: Gender.female, marital_status: MaritalStatus.divorced,  phone: '54999010007', profession: 'Designer',       birth_date: new Date('1991-04-17') },
  { key: 'henrique',  full_name: 'Henrique Santos',  classification: PersonClassification.visitor,  gender: Gender.male,   marital_status: MaritalStatus.single,    phone: '54999010008', birth_date: new Date('2000-12-05') },
  { key: 'isabela',   full_name: 'Isabela Martins',  classification: PersonClassification.member,   gender: Gender.female, marital_status: MaritalStatus.single,    phone: '54999010009', profession: 'Advogada',       birth_date: new Date('1988-02-14') },
  { key: 'karina',    full_name: 'Karina Oliveira',  classification: PersonClassification.member,   gender: Gender.female, marital_status: MaritalStatus.married,   phone: '54999010010', profession: 'Médica',         birth_date: new Date('1979-06-21'), email: 'karina.oliveira@example.com' },
  { key: 'lucas',     full_name: 'Lucas Ferreira',   classification: PersonClassification.attendee, gender: Gender.male,   marital_status: MaritalStatus.single,    phone: '54999010011', profession: 'Estudante',      birth_date: new Date('2002-10-09') },
  { key: 'sofia',     full_name: 'Sofia Rocha',      classification: PersonClassification.member,   gender: Gender.female, marital_status: MaritalStatus.single,    phone: '54999010012', birth_date: new Date('2012-08-03') },
];

/**
 * Popula todos os módulos com dado de demonstração — não só o mínimo do e2e.
 * Só é chamada para tenants com `TenantSpec.demoData: true` (hoje,
 * teste1-church e teste2-church): servem tanto para teste automatizado quanto
 * para demonstração comercial, e por isso precisam de volume e variedade em
 * cada módulo, não só o suficiente para um fluxo passar.
 *
 * Idempotente pelo mesmo padrão do resto do arquivo: cada bloco confere se o
 * registro já existe (por nome/chave natural) antes de criar.
 */
async function seedDemoData(seeded: SeededTenant): Promise<void> {
  const { tenantId, congregationId, adminUserId, adminPersonId, ministryId, celebrationId } = seeded;
  console.log('  ── dado de demonstração ──');

  // Meia-noite, não a hora exata da execução: os blocos abaixo usam a data
  // devolvida como chave de idempotência (`findFirst` por `occurred_at`
  // exato) — com a hora corrente, rodar o seed duas vezes no mesmo dia
  // gerava uma linha nova a cada vez, porque o timestamp nunca batia.
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
  };

  // ── Pessoas ────────────────────────────────────────────────────────────
  const persons: Record<string, string> = {};
  for (const p of DEMO_PERSONS) {
    let person = await prisma.person.findFirst({
      where: { tenant_id: tenantId, congregation_id: congregationId, full_name: p.full_name },
      select: { id: true },
    });
    if (!person) {
      person = await prisma.person.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          full_name: p.full_name,
          classification: p.classification,
          gender: p.gender,
          marital_status: p.marital_status,
          phone: p.phone,
          email: p.email,
          profession: p.profession,
          birth_date: p.birth_date,
          membership_date: p.classification === PersonClassification.member ? p.birth_date : null,
        },
        select: { id: true },
      });
    }
    persons[p.key] = person.id;
  }
  console.log(`  persons:          ${DEMO_PERSONS.length} pessoas de demonstração`);

  // ── Família (household) ───────────────────────────────────────────────
  let household = await prisma.household.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, name: 'Família Rocha' },
    select: { id: true },
  });
  if (!household) {
    household = await prisma.household.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Família Rocha' },
      select: { id: true },
    });
  }
  for (const [personKey, role] of [
    ['felipe', HouseholdMemberRole.head],
    ['sofia', HouseholdMemberRole.child],
  ] as const) {
    const exists = await prisma.householdMember.findUnique({
      where: { household_id_person_id: { household_id: household.id, person_id: persons[personKey] } },
      select: { household_id: true },
    });
    if (!exists) {
      await prisma.householdMember.create({
        data: { household_id: household.id, person_id: persons[personKey], role },
      });
    }
  }
  await prisma.person.updateMany({
    where: { id: { in: [persons['felipe'], persons['sofia']] } },
    data: { household_id: household.id },
  });
  console.log('  household:        Família Rocha (Felipe + Sofia)');

  // ── Tags, visitas, histórico de classificação e consentimento LGPD ──────
  for (const [personKey, tag] of [
    ['ana', 'Batizado'],
    ['bruno', 'Líder'],
  ] as const) {
    const exists = await prisma.personTag.findFirst({
      where: { tenant_id: tenantId, person_id: persons[personKey], tag },
      select: { id: true },
    });
    if (!exists) {
      await prisma.personTag.create({
        data: { tenant_id: tenantId, congregation_id: congregationId, person_id: persons[personKey], tag },
      });
    }
  }

  for (const [personKey, origin] of [
    ['diego', VisitOrigin.service],
    ['henrique', VisitOrigin.other],
  ] as const) {
    const exists = await prisma.visitRecord.findFirst({
      where: { tenant_id: tenantId, person_id: persons[personKey] },
      select: { id: true },
    });
    if (!exists) {
      await prisma.visitRecord.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          person_id: persons[personKey],
          origin,
          visited_at: new Date(),
        },
      });
    }
  }

  const classificationHistoryExists = await prisma.classificationHistory.findFirst({
    where: { tenant_id: tenantId, person_id: persons['gabriela'] },
    select: { id: true },
  });
  if (!classificationHistoryExists) {
    await prisma.classificationHistory.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        person_id: persons['gabriela'],
        from_classification: PersonClassification.visitor,
        to_classification: PersonClassification.attendee,
        changed_by_user_id: adminUserId,
        reason: 'Presença consistente nas últimas semanas.',
      },
    });
  }

  for (const personKey of ['ana', 'karina'] as const) {
    const exists = await prisma.consentRecord.findFirst({
      where: { tenant_id: tenantId, person_id: persons[personKey] },
      select: { id: true },
    });
    if (!exists) {
      await prisma.consentRecord.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          person_id: persons[personKey],
          version: '1.0',
          consented_at: daysAgo(30),
          origin: 'cadastro-publico',
        },
      });
    }
  }
  console.log('  pessoas:          tags, visitas, histórico de classificação e consentimento LGPD');

  // ── Pequenos grupos ────────────────────────────────────────────────────
  const groupTypeCelula = await prisma.groupType.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, name: 'Célula' },
    select: { id: true },
  });
  const groupTypeDiscipulado = await prisma.groupType.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, name: 'Discipulado' },
    select: { id: true },
  });
  if (!groupTypeCelula || !groupTypeDiscipulado) {
    throw new Error('seedDemoData: group_types padrão não encontrados — rode seedGroupTypes antes.');
  }

  let network = await prisma.network.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, name: 'Rede Central' },
    select: { id: true },
  });
  if (!network) {
    network = await prisma.network.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: 'Rede Central',
        leader_person_id: persons['ana'],
        health_goal_pct: 80,
      },
      select: { id: true },
    });
  }

  const groupSpecs = [
    { key: 'celula', name: 'Célula Vida Nova', groupTypeId: groupTypeCelula.id, leaderKey: 'ana', networkId: network.id, members: ['carla', 'diego', 'elaine', 'gabriela'] as const },
    { key: 'discipulado', name: 'Discipulado Novos Convertidos', groupTypeId: groupTypeDiscipulado.id, leaderKey: 'bruno', networkId: null, members: ['henrique', 'isabela', 'lucas'] as const },
  ];

  const groups: Record<string, string> = {};
  const groupIds: string[] = [];
  for (const g of groupSpecs) {
    let group = await prisma.smallGroup.findFirst({
      where: { tenant_id: tenantId, congregation_id: congregationId, name: g.name },
      select: { id: true },
    });
    if (!group) {
      group = await prisma.smallGroup.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          name: g.name,
          group_type_id: g.groupTypeId,
          leader_person_id: persons[g.leaderKey],
          network_id: g.networkId,
          meeting_time: '19:30',
          recurrence: 'weekly',
          is_public: true,
          public_description: `Grupo de demonstração — ${g.name}`,
        },
        select: { id: true },
      });
    }
    groups[g.key] = group.id;
    groupIds.push(group.id);

    for (const memberKey of g.members) {
      const exists = await prisma.groupMembership.findUnique({
        where: { small_group_id_person_id: { small_group_id: group.id, person_id: persons[memberKey] } },
        select: { id: true },
      });
      if (!exists) {
        await prisma.groupMembership.create({
          data: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            small_group_id: group.id,
            person_id: persons[memberKey],
            role: GroupMemberRole.member,
          },
        });
      }
    }

    // Encontros passados, com presença registrada.
    const meetingDates = [14, 7].map((n) => daysAgo(n));
    for (const occurredAt of meetingDates) {
      let meeting = await prisma.groupMeeting.findFirst({
        where: { tenant_id: tenantId, small_group_id: group.id, occurred_at: occurredAt },
        select: { id: true },
      });
      if (!meeting) {
        meeting = await prisma.groupMeeting.create({
          data: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            small_group_id: group.id,
            occurred_at: occurredAt,
            topic: 'Estudo semanal',
            offering_amount: 45.0,
          },
          select: { id: true },
        });
        for (const memberKey of [g.leaderKey, ...g.members]) {
          await prisma.attendanceRecord.create({
            data: {
              tenant_id: tenantId,
              congregation_id: congregationId,
              group_meeting_id: meeting.id,
              person_id: persons[memberKey],
            },
          });
        }
      }
      if (occurredAt === meetingDates[0]) groups[`${g.key}_meeting`] = meeting.id;
    }

    // Pedidos de oração e mensagens do chat da célula.
    const prayerExists = await prisma.prayerRequest.findFirst({
      where: { tenant_id: tenantId, small_group_id: group.id },
      select: { id: true },
    });
    if (!prayerExists) {
      await prisma.prayerRequest.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          small_group_id: group.id,
          person_id: persons[g.members[0]],
          content: 'Por saúde da família e sabedoria no trabalho.',
        },
      });
    }

    const messageExists = await prisma.groupMessage.findFirst({
      where: { tenant_id: tenantId, small_group_id: group.id },
      select: { id: true },
    });
    if (!messageExists) {
      await prisma.groupMessage.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          small_group_id: group.id,
          person_id: persons[g.leaderKey],
          content: 'Pessoal, confirmando o encontro desta semana às 19h30!',
        },
      });
    }
  }
  console.log(`  small_groups:     ${groupSpecs.length} (com encontros, presença, oração e chat)`);

  // ── Material de estudo ─────────────────────────────────────────────────
  let material = await prisma.studyMaterial.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, title: 'Estudo: Fé em Ação' },
    select: { id: true },
  });
  if (!material) {
    material = await prisma.studyMaterial.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        title: 'Estudo: Fé em Ação',
        description: 'Material de apoio para o encontro semanal dos pequenos grupos.',
        author: 'Equipe de Discipulado',
        source_type: StudyMaterialSource.rich_text,
        rich_content: '# Fé em Ação\n\nTiago 2:14-26 — reflexão para o pequeno grupo.',
        publish_at: new Date(),
        version: 1,
        tags: ['fé', 'discipulado'],
      },
      select: { id: true },
    });
    await prisma.studyMaterialVersion.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        study_material_id: material.id,
        version: 1,
        title: 'Estudo: Fé em Ação',
        source_type: StudyMaterialSource.rich_text,
        rich_content: '# Fé em Ação\n\nTiago 2:14-26 — reflexão para o pequeno grupo.',
        publish_at: new Date(),
        tags: ['fé', 'discipulado'],
        changed_by_user_id: adminUserId,
      },
    });
    for (const groupId of groupIds) {
      await prisma.materialTarget.upsert({
        where: { study_material_id_small_group_id: { study_material_id: material.id, small_group_id: groupId } },
        update: {},
        create: { study_material_id: material.id, small_group_id: groupId },
      });
    }
    if (groups['celula_meeting']) {
      await prisma.groupMeetingMaterial.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          meeting_id: groups['celula_meeting'],
          material_id: material.id,
        },
      });
    }
    for (const personKey of ['carla', 'isabela']) {
      await prisma.materialOpenRecord.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          study_material_id: material.id,
          person_id: persons[personKey],
        },
      });
    }
  }
  console.log('  study_material:   Estudo: Fé em Ação (com versão e registros de abertura)');

  // ── Financeiro ─────────────────────────────────────────────────────────
  const categories = await prisma.financialCategory.findMany({
    where: { tenant_id: tenantId, congregation_id: congregationId, is_system: true },
    select: { id: true, name: true },
  });
  const catByName = new Map(categories.map((c) => [c.name, c.id]));

  let costCenter = await prisma.costCenter.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, name: 'Administração' },
    select: { id: true },
  });
  if (!costCenter) {
    costCenter = await prisma.costCenter.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Administração' },
      select: { id: true },
    });
  }

  let recurringRule = await prisma.recurringRule.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, frequency: RecurringFrequency.monthly },
    select: { id: true },
  });
  if (!recurringRule) {
    const nextOccurrence = new Date();
    nextOccurrence.setMonth(nextOccurrence.getMonth() + 1);
    recurringRule = await prisma.recurringRule.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        mode: RecurringRuleMode.fixed,
        frequency: RecurringFrequency.monthly,
        next_occurrence_at: nextOccurrence,
        is_active: true,
      },
      select: { id: true },
    });
  }

  const transactionSpecs: {
    key: string;
    type: TransactionType;
    amount: number;
    categoryName: string;
    occurred_at: Date;
    status: TransactionStatus;
    donorKey?: string;
    is_anonymous?: boolean;
    cost_center_id?: string;
    recurring_rule_id?: string;
  }[] = [
    { key: 'dizimo_ana',       type: TransactionType.income,  amount: 500,  categoryName: 'Dízimo',                occurred_at: daysAgo(3),  status: TransactionStatus.confirmed, donorKey: 'ana' },
    { key: 'oferta_anonima',   type: TransactionType.income,  amount: 300,  categoryName: 'Oferta',                occurred_at: daysAgo(3),  status: TransactionStatus.confirmed, is_anonymous: true },
    { key: 'oferta_missoes',   type: TransactionType.income,  amount: 150,  categoryName: 'Oferta Missionária',    occurred_at: daysAgo(10), status: TransactionStatus.confirmed, recurring_rule_id: recurringRule.id },
    { key: 'doacao_karina',    type: TransactionType.income,  amount: 1000, categoryName: 'Doação Especial',       occurred_at: daysAgo(20), status: TransactionStatus.confirmed, donorKey: 'karina' },
    { key: 'aluguel',          type: TransactionType.expense, amount: 1200, categoryName: 'Aluguel',               occurred_at: daysAgo(5),  status: TransactionStatus.paid, cost_center_id: costCenter.id },
    { key: 'agua_luz',         type: TransactionType.expense, amount: 350,  categoryName: 'Água / Luz / Internet', occurred_at: daysAgo(5),  status: TransactionStatus.paid, cost_center_id: costCenter.id },
    { key: 'eventos',          type: TransactionType.expense, amount: 400,  categoryName: 'Eventos',               occurred_at: daysAgo(1),  status: TransactionStatus.pending },
    { key: 'missoes_despesa',  type: TransactionType.expense, amount: 250,  categoryName: 'Missões',               occurred_at: daysAgo(15), status: TransactionStatus.paid },
  ];

  const transactions: Record<string, string> = {};
  for (const t of transactionSpecs) {
    const categoryId = catByName.get(t.categoryName);
    if (!categoryId) throw new Error(`seedDemoData: categoria financeira "${t.categoryName}" não encontrada.`);

    let tx = await prisma.financialTransaction.findFirst({
      where: { tenant_id: tenantId, congregation_id: congregationId, category_id: categoryId, amount: t.amount, occurred_at: t.occurred_at },
      select: { id: true },
    });
    if (!tx) {
      tx = await prisma.financialTransaction.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          type: t.type,
          amount: t.amount,
          occurred_at: t.occurred_at,
          description: `${t.categoryName} — demonstração`,
          category_id: categoryId,
          cost_center_id: t.cost_center_id,
          donor_person_id: t.donorKey ? persons[t.donorKey] : null,
          is_anonymous: t.is_anonymous ?? false,
          source: TransactionSource.manual,
          status: t.status,
          recurring_rule_id: t.recurring_rule_id,
          created_by_user_id: adminUserId,
        },
        select: { id: true },
      });
    }
    transactions[t.key] = tx.id;
  }
  console.log(`  transactions:     ${transactionSpecs.length} (financeiro, com centro de custo e recorrência)`);

  const receiptExists = await prisma.donationReceipt.findFirst({
    where: { tenant_id: tenantId, transaction_id: transactions['doacao_karina'] },
    select: { id: true },
  });
  if (!receiptExists) {
    await prisma.donationReceipt.create({
      data: {
        tenant_id: tenantId,
        transaction_id: transactions['doacao_karina'],
        person_id: persons['karina'],
        receipt_url: 'https://example.com/recibos/demo-karina.pdf',
      },
    });
  }

  const attachmentExists = await prisma.transactionAttachment.findFirst({
    where: { tenant_id: tenantId, transaction_id: transactions['aluguel'] },
    select: { id: true },
  });
  if (!attachmentExists) {
    await prisma.transactionAttachment.create({
      data: {
        tenant_id: tenantId,
        transaction_id: transactions['aluguel'],
        file_url: 'https://example.com/comprovantes/demo-aluguel.pdf',
        file_name: 'comprovante-aluguel.pdf',
        uploaded_by_user_id: adminUserId,
      },
    });
  }

  let pixPayment = await prisma.pixPayment.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, transaction_id: transactions['dizimo_ana'] },
    select: { id: true },
  });
  if (!pixPayment) {
    pixPayment = await prisma.pixPayment.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        scenario: PixScenario.dynamic,
        transaction_id: transactions['dizimo_ana'],
        amount: 500,
        donor_person_id: persons['ana'],
        category_id: catByName.get('Dízimo')!,
        status: PixStatus.confirmed,
        pix_key: '12345678900',
        paid_at: daysAgo(3),
      },
      select: { id: true },
    });
  }
  console.log('  pix_payment:      1 (confirmado, ligado ao dízimo da Ana)');

  // ── Conteúdo ───────────────────────────────────────────────────────────
  let devotionalPost = await prisma.contentPost.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, title: 'Devocional: Fé que move montanhas' },
    select: { id: true },
  });
  if (!devotionalPost) {
    devotionalPost = await prisma.contentPost.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: ContentPostType.devotional,
        title: 'Devocional: Fé que move montanhas',
        body: 'Reflexão para a semana a partir de Marcos 11:22-24.',
        is_draft: false,
        publish_at: daysAgo(2),
        published_at: daysAgo(2),
        created_by_user_id: adminUserId,
      },
      select: { id: true },
    });
  }

  let noticePost = await prisma.contentPost.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, title: 'Aviso: Mudança de horário do culto' },
    select: { id: true },
  });
  if (!noticePost) {
    noticePost = await prisma.contentPost.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: ContentPostType.notice,
        title: 'Aviso: Mudança de horário do culto',
        body: 'A partir do próximo domingo, o culto passa a ser às 10h.',
        is_draft: false,
        publish_at: daysAgo(1),
        published_at: daysAgo(1),
        created_by_user_id: adminUserId,
      },
      select: { id: true },
    });
  }

  const eventStart = new Date();
  eventStart.setDate(eventStart.getDate() + 14);
  const eventEnd = new Date(eventStart);
  eventEnd.setHours(eventEnd.getHours() + 3);

  let eventPost = await prisma.contentPost.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, title: 'Acampamento de Jovens 2026' },
    select: { id: true },
  });
  if (!eventPost) {
    eventPost = await prisma.contentPost.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        type: ContentPostType.event,
        title: 'Acampamento de Jovens 2026',
        body: 'Três dias de comunhão, palavra e diversão para a juventude.',
        is_draft: false,
        publish_at: daysAgo(5),
        published_at: daysAgo(5),
        created_by_user_id: adminUserId,
        event_starts_at: eventStart,
        event_ends_at: eventEnd,
        event_location: 'Sítio Vale da Bênção',
        registration_enabled: true,
        registration_limit: 40,
        registration_deadline: eventStart,
      },
      select: { id: true },
    });
  }
  console.log('  content_posts:    3 (devocional, aviso e evento com inscrição)');

  let segment = await prisma.audienceSegment.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, name: 'Jovens e adolescentes' },
    select: { id: true },
  });
  if (!segment) {
    segment = await prisma.audienceSegment.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: 'Jovens e adolescentes',
        criteria: { classification: ['member', 'attendee'], age_max: 25 },
        segment_type: AudienceSegmentType.age_range,
      },
      select: { id: true },
    });
  }
  await prisma.postSegment.upsert({
    where: { post_id_segment_id: { post_id: eventPost.id, segment_id: segment.id } },
    update: {},
    create: { post_id: eventPost.id, segment_id: segment.id },
  });

  for (const [personKey, fullName] of [
    ['lucas', 'Lucas Ferreira'],
    ['henrique', 'Henrique Santos'],
  ] as const) {
    const exists = await prisma.eventRegistration.findFirst({
      where: { tenant_id: tenantId, content_post_id: eventPost.id, person_id: persons[personKey] },
      select: { id: true },
    });
    if (!exists) {
      await prisma.eventRegistration.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          content_post_id: eventPost.id,
          person_id: persons[personKey],
          full_name: fullName,
          status: EventRegistrationStatus.confirmed,
        },
      });
    }
  }
  console.log('  event_regs:       2 (Acampamento de Jovens)');

  const dispatchExists = await prisma.notificationDispatch.findFirst({
    where: { tenant_id: tenantId, content_post_id: noticePost.id },
    select: { id: true },
  });
  if (!dispatchExists) {
    await prisma.notificationDispatch.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        content_post_id: noticePost.id,
        channel: NotificationChannel.push,
        status: NotificationStatus.sent,
        sent_at: daysAgo(1),
        reached: 120,
        opened: 64,
      },
    });
  }

  // ── Voluntariado e celebrações ────────────────────────────────────────
  const instanceDate = new Date();
  instanceDate.setDate(instanceDate.getDate() + (7 - instanceDate.getDay()));
  instanceDate.setHours(0, 0, 0, 0);

  let celebrationInstance = await prisma.celebrationInstance.findFirst({
    where: { tenant_id: tenantId, celebration_id: celebrationId, scheduled_date: instanceDate },
    select: { id: true },
  });
  if (!celebrationInstance) {
    celebrationInstance = await prisma.celebrationInstance.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_id: celebrationId,
        scheduled_date: instanceDate,
        status: CelebrationInstanceStatus.published,
      },
      select: { id: true },
    });
  }

  let serviceOrder = await prisma.serviceOrder.findFirst({
    where: { tenant_id: tenantId, celebration_instance_id: celebrationInstance.id },
    select: { id: true },
  });
  if (!serviceOrder) {
    serviceOrder = await prisma.serviceOrder.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_instance_id: celebrationInstance.id,
        title: 'Roteiro — Culto de Domingo',
        published_at: new Date(),
      },
      select: { id: true },
    });

    const worshipItem = await prisma.serviceOrderItem.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        service_order_id: serviceOrder.id,
        sequence: 1,
        name: 'Louvor e adoração',
        type: ServiceOrderItemType.worship,
        start_offset_minutes: 0,
        duration_minutes: 25,
        responsible_type: ResponsibleType.ministry,
        ministry_id: ministryId,
      },
      select: { id: true },
    });
    await prisma.serviceOrderItem.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        service_order_id: serviceOrder.id,
        sequence: 2,
        name: 'Pregação',
        type: ServiceOrderItemType.sermon,
        start_offset_minutes: 30,
        duration_minutes: 40,
        responsible_type: ResponsibleType.person,
        person_id: adminPersonId,
      },
      select: { id: true },
    });
    await prisma.serviceOrderItem.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        service_order_id: serviceOrder.id,
        sequence: 3,
        name: 'Oferta',
        type: ServiceOrderItemType.offering,
        start_offset_minutes: 70,
        duration_minutes: 10,
        responsible_type: ResponsibleType.ministry,
        ministry_id: ministryId,
      },
      select: { id: true },
    });

    const setlist = await prisma.setlist.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        service_order_item_id: worshipItem.id,
      },
      select: { id: true },
    });

    const songSpecs = [
      { title: 'Grande é o Senhor', key: 'G', bpm: 76 },
      { title: 'Ousado Amor', key: 'A', bpm: 68 },
    ];
    for (const [i, s] of songSpecs.entries()) {
      let song = await prisma.song.findFirst({
        where: { tenant_id: tenantId, congregation_id: congregationId, title: s.title },
        select: { id: true },
      });
      if (!song) {
        song = await prisma.song.create({
          data: { tenant_id: tenantId, congregation_id: congregationId, title: s.title, key: s.key, bpm: s.bpm },
          select: { id: true },
        });
      }
      await prisma.setlistSong.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          setlist_id: setlist.id,
          song_id: song.id,
          sequence: i + 1,
          title: s.title,
          key: s.key,
          bpm: s.bpm,
        },
      });
    }
  }
  console.log('  celebration:      1 instância publicada, com roteiro, escala e repertório');

  let schedule = await prisma.celebrationSchedule.findFirst({
    where: { celebration_instance_id: celebrationInstance.id },
    select: { id: true },
  });
  if (!schedule) {
    schedule = await prisma.celebrationSchedule.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_instance_id: celebrationInstance.id,
        status: ScheduleStatus.published,
      },
      select: { id: true },
    });
  }

  let celebrationMinistry = await prisma.celebrationMinistry.findFirst({
    where: { schedule_id: schedule.id, ministry_id: ministryId },
    select: { id: true },
  });
  if (!celebrationMinistry) {
    celebrationMinistry = await prisma.celebrationMinistry.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        schedule_id: schedule.id,
        ministry_id: ministryId,
        slots: 2,
      },
      select: { id: true },
    });
  }

  const leaderVolunteerProfile = await prisma.volunteerProfile.findFirst({
    where: { tenant_id: tenantId, person_id: adminPersonId },
    select: { id: true },
  });
  if (leaderVolunteerProfile) {
    const assignmentExists = await prisma.celebrationAssignment.findFirst({
      where: { celebration_ministry_id: celebrationMinistry.id, volunteer_profile_id: leaderVolunteerProfile.id },
      select: { id: true },
    });
    if (!assignmentExists) {
      await prisma.celebrationAssignment.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          celebration_ministry_id: celebrationMinistry.id,
          volunteer_profile_id: leaderVolunteerProfile.id,
          status: AssignmentStatus.confirmed,
          notified_at: daysAgo(2),
          responded_at: daysAgo(2),
        },
      });
    }

    const referenceDate = new Date();
    let unavailability = await prisma.volunteerUnavailability.findFirst({
      where: {
        volunteer_profile_id: leaderVolunteerProfile.id,
        reference_month: referenceDate.getMonth() + 1,
        reference_year: referenceDate.getFullYear(),
      },
      select: { id: true },
    });
    if (!unavailability) {
      unavailability = await prisma.volunteerUnavailability.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          volunteer_profile_id: leaderVolunteerProfile.id,
          reference_month: referenceDate.getMonth() + 1,
          reference_year: referenceDate.getFullYear(),
          notes: 'Viagem em família',
        },
        select: { id: true },
      });
      const unavailableDate = new Date();
      unavailableDate.setDate(unavailableDate.getDate() + 10);
      await prisma.volunteerUnavailabilityDate.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          unavailability_id: unavailability.id,
          date: unavailableDate,
        },
      });
    }
  }

  let scheduleTemplate = await prisma.scheduleTemplate.findFirst({
    where: { tenant_id: tenantId, congregation_id: congregationId, name: 'Culto de Domingo — padrão' },
    select: { id: true },
  });
  if (!scheduleTemplate) {
    scheduleTemplate = await prisma.scheduleTemplate.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: 'Culto de Domingo — padrão',
        description: 'Modelo de escala usado toda semana.',
      },
      select: { id: true },
    });
    await prisma.scheduleTemplateMinistry.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        template_id: scheduleTemplate.id,
        ministry_id: ministryId,
        slots: 2,
      },
    });
  }

  const notifPrefExists = await prisma.notificationPreference.findFirst({
    where: { user_account_id: adminUserId },
    select: { id: true },
  });
  if (!notifPrefExists) {
    await prisma.notificationPreference.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        user_account_id: adminUserId,
        avisos: true,
        oracao: true,
        eventos: true,
        devocional: true,
      },
    });
  }
  console.log('  ── fim do dado de demonstração ──');
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
    const tenant = await seedTenant(spec);
    seeded.set(spec.slug, tenant);
    if (spec.demoData) {
      await seedDemoData(tenant);
    }
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
