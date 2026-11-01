/**
 * Seed do módulo Kids (T35) e limpeza do resíduo do e2e do balcão.
 *
 * SÓ para `teste1-church` e `teste2-church` (CLAUDE.md, docs/AMBIENTES.md):
 * toda função aqui recusa outro slug, `doca-church` inclusive. Idempotente:
 * cada registro é conferido por chave natural antes de criar.
 *
 * Uso avulso (só a limpeza + seed Kids, sem rodar o seed inteiro):
 *   npm run db:kids -w orbien-backend
 */
import { CelebrationInstanceStatus, HouseholdMemberRole, PersonClassification, PrismaClient } from '@prisma/client';
import { KIDS_TERM_VERSION } from '../src/kids/consent/kids-consent.terms';

const TEST_SLUGS = ['teste1-church', 'teste2-church'] as const;

function assertTestTenant(slug: string): void {
  if (!(TEST_SLUGS as readonly string[]).includes(slug)) {
    throw new Error(`Seed Kids só roda em ${TEST_SLUGS.join(' e ')}; recebido "${slug}".`);
  }
}

const ROOMS = [
  { name: 'Berçário', min_age_months: 0, max_age_months: 23, capacity: 8, min_volunteers: 2, allows_out_of_range: false },
  { name: 'Maternal', min_age_months: 24, max_age_months: 59, capacity: 12, min_volunteers: 2, allows_out_of_range: false },
  { name: 'Júnior', min_age_months: 60, max_age_months: 143, capacity: 20, min_volunteers: 1, allows_out_of_range: true },
];

const FAMILIES = [
  {
    household: 'Família Tavares',
    guardians: [
      { key: 'marcos', name: 'Marcos Tavares', phone: '54999020001', relationship: 'Pai', primary: true },
      { key: 'lourdes', name: 'Lourdes Tavares', phone: '54999020002', relationship: 'Avó', primary: false },
    ],
    children: [
      { name: 'Helena Tavares', ageMonths: 14, allergies: null, medical: null },
      { name: 'Davi Tavares', ageMonths: 40, allergies: 'Amendoim', medical: null },
      { name: 'Pedro Tavares', ageMonths: 90, allergies: null, medical: 'Asma leve; bombinha na mochila' },
    ],
  },
  {
    household: 'Família Menezes',
    guardians: [{ key: 'carla', name: 'Carla Menezes', phone: '54999020003', relationship: 'Mãe', primary: true }],
    children: [{ name: 'Lucas Menezes', ageMonths: 70, allergies: 'Lactose', medical: null }],
  },
];

function monthsAgo(m: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() - m);
  return d;
}

/**
 * Apaga o que o e2e do balcão deixa (`web/e2e/kids-balcao.spec.ts`): turmas
 * `E2E Kids <ts>`, crianças `Criança E2E <ts>` e as instâncias temporárias do
 * culto. A API não apaga linha de Kids, então o resíduo só sai por aqui.
 */
export async function cleanKidsE2eResidue(
  prisma: PrismaClient,
  tenantId: string,
  slug: string,
): Promise<{ rooms: number; children: number; instances: number }> {
  assertTestTenant(slug);
  const instances = await prisma.celebrationInstance.deleteMany({
    where: { tenant_id: tenantId, notes: 'instância temporária de e2e (kids)' },
  });
  const rooms = await prisma.kidsRoom.deleteMany({ where: { tenant_id: tenantId, name: { startsWith: 'E2E Kids ' } } });
  const children = await prisma.person.deleteMany({
    where: { tenant_id: tenantId, is_child: true, full_name: { startsWith: 'Criança E2E ' } },
  });
  return { rooms: rooms.count, children: children.count, instances: instances.count };
}

export async function seedKidsDemo(
  prisma: PrismaClient,
  seeded: { tenantId: string; congregationId: string; celebrationId: string },
  slug: string,
): Promise<void> {
  assertTestTenant(slug);
  const { tenantId, congregationId, celebrationId } = seeded;
  const scope = { tenant_id: tenantId, congregation_id: congregationId };
  console.log('  ── kids ──');

  const cleaned = await cleanKidsE2eResidue(prisma, tenantId, slug);
  console.log(`  kids e2e:         resíduo removido (${cleaned.rooms} turma(s), ${cleaned.children} criança(s), ${cleaned.instances} culto(s))`);

  const rooms: Record<string, string> = {};
  for (const r of ROOMS) {
    const found = await prisma.kidsRoom.findFirst({ where: { ...scope, name: r.name }, select: { id: true } });
    rooms[r.name] = found?.id ?? (await prisma.kidsRoom.create({ data: { ...scope, ...r }, select: { id: true } })).id;
  }
  console.log(`  kids rooms:       ${ROOMS.map((r) => r.name).join(', ')}`);

  const ensurePerson = async (full_name: string, data: Record<string, unknown>) => {
    const found = await prisma.person.findFirst({ where: { ...scope, full_name }, select: { id: true } });
    if (found) return found.id;
    return (await prisma.person.create({ data: { ...scope, full_name, ...data } as never, select: { id: true } })).id;
  };

  for (const fam of FAMILIES) {
    let household = await prisma.household.findFirst({ where: { ...scope, name: fam.household }, select: { id: true } });
    household ??= await prisma.household.create({ data: { ...scope, name: fam.household }, select: { id: true } });
    const ensureMember = async (personId: string, role: HouseholdMemberRole) => {
      await prisma.householdMember.upsert({
        where: { household_id_person_id: { household_id: household.id, person_id: personId } },
        update: {},
        create: { household_id: household.id, person_id: personId, role },
      });
      await prisma.person.update({ where: { id: personId }, data: { household_id: household.id } });
    };

    const guardianIds: Array<{ id: string; relationship: string; primary: boolean }> = [];
    for (const g of fam.guardians) {
      const id = await ensurePerson(g.name, {
        classification: PersonClassification.member,
        phone: g.phone,
        is_child: false,
        birth_date: monthsAgo(12 * 35),
      });
      await ensureMember(id, g.primary ? HouseholdMemberRole.head : HouseholdMemberRole.other);
      guardianIds.push({ id, relationship: g.relationship, primary: g.primary });
      if (g.primary) {
        const consent = await prisma.consentRecord.findFirst({
          where: { ...scope, person_id: id, origin: 'kids', revoked_at: null },
          select: { id: true },
        });
        if (!consent) {
          await prisma.consentRecord.create({
            data: { ...scope, person_id: id, version: KIDS_TERM_VERSION, consented_at: new Date(), origin: 'kids' },
          });
        }
      }
    }

    for (const c of fam.children) {
      const childId = await ensurePerson(c.name, {
        classification: PersonClassification.attendee,
        is_child: true,
        birth_date: monthsAgo(c.ageMonths),
      });
      await ensureMember(childId, HouseholdMemberRole.child);
      for (const g of guardianIds) {
        await prisma.kidsGuardian.upsert({
          where: { child_id_guardian_person_id: { child_id: childId, guardian_person_id: g.id } },
          update: {},
          create: {
            ...scope,
            child_id: childId,
            guardian_person_id: g.id,
            relationship: g.relationship,
            can_pickup: true,
            is_primary: g.primary,
          },
        });
      }
      if (c.allergies || c.medical) {
        await prisma.kidsChildHealth.upsert({
          where: { person_id: childId },
          update: {},
          create: { ...scope, person_id: childId, allergies: c.allergies, medical_notes: c.medical },
        });
      }
    }
  }
  console.log(`  kids children:    ${FAMILIES.flatMap((f) => f.children).length} crianças, ${FAMILIES.length} famílias`);

  // Culto de hoje com as três turmas e o de daqui a 7 dias só com duas: as duas
  // formas (0..N sessões) convivem no mesmo seed.
  const day = (offset: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d;
  };
  for (const [offset, roomNames] of [
    [0, ['Berçário', 'Maternal', 'Júnior']],
    [7, ['Maternal', 'Júnior']],
  ] as const) {
    const date = day(offset);
    let instance = await prisma.celebrationInstance.findFirst({
      where: { tenant_id: tenantId, celebration_id: celebrationId, scheduled_date: date },
      select: { id: true },
    });
    instance ??= await prisma.celebrationInstance.create({
      data: { ...scope, celebration_id: celebrationId, scheduled_date: date, status: CelebrationInstanceStatus.published },
      select: { id: true },
    });
    for (const name of roomNames) {
      await prisma.kidsSession.upsert({
        where: { celebration_instance_id_room_id: { celebration_instance_id: instance.id, room_id: rooms[name]! } },
        update: {},
        create: { ...scope, celebration_instance_id: instance.id, room_id: rooms[name]! },
      });
    }
  }
  console.log('  kids sessions:    culto de hoje (3 turmas) e de +7 dias (2 turmas)');
}

if (require.main === module) {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env['DIRECT_URL'] } } });
  (async () => {
    for (const slug of TEST_SLUGS) {
      const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
      if (!tenant) throw new Error(`Tenant ${slug} não existe — rode o seed completo antes.`);
      const congregation = await prisma.congregation.findFirstOrThrow({
        where: { tenant_id: tenant.id },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      const celebration = await prisma.celebration.findFirstOrThrow({
        where: { tenant_id: tenant.id, congregation_id: congregation.id },
        orderBy: { created_at: 'asc' },
        select: { id: true },
      });
      console.log(slug);
      await seedKidsDemo(prisma, { tenantId: tenant.id, congregationId: congregation.id, celebrationId: celebration.id }, slug);
    }
  })()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
