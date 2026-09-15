/**
 * `SmallGroupsService.multiply` roda `prisma.runInTx` — a transação real
 * (create + updateMany + upsert) só se prova contra Postgres de verdade, sob
 * RLS real. Mesmo padrão de setup de `small-groups-hierarchy.spec.ts`:
 * tenant/congregação/pessoas efêmeras via `prismaAdmin`, execução via
 * `runAsTenant`.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { GroupMemberRole } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SmallGroupsService } from '../../src/small-groups/small-groups.service';
import { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { prismaAdmin, runAsTenant } from '../helpers/rls';

const ts = Date.now();
const slug = `sg-multiply-${ts}`;

let prismaService: PrismaService;
let service: SmallGroupsService;

let tenantId: string;
let congregationId: string;
let groupTypeId: string;

let oldLeaderId: string;
let member1Id: string;
let member2Id: string;
let member3Id: string;
let newLeaderId: string;

let motherId: string;

let MANAGER_USER: JwtPayload;

beforeAll(async () => {
  const tenant = await prismaAdmin.tenant.create({ data: { slug, name: 'Tenant Multiplicação' } });
  tenantId = tenant.id;

  const cong = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantId, name: 'Multiplicação — Sede' },
  });
  congregationId = cong.id;

  const groupType = await prismaAdmin.groupType.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Célula' },
  });
  groupTypeId = groupType.id;

  const [oldLeader, member1, member2, member3, newLeader] = await Promise.all([
    prismaAdmin.person.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Líder Original' },
    }),
    prismaAdmin.person.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Membro 1' },
    }),
    prismaAdmin.person.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Membro 2' },
    }),
    prismaAdmin.person.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Membro 3' },
    }),
    prismaAdmin.person.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Novo Líder' },
    }),
  ]);
  oldLeaderId = oldLeader.id;
  member1Id = member1.id;
  member2Id = member2.id;
  member3Id = member3.id;
  newLeaderId = newLeader.id;

  prismaService = new PrismaService();
  await prismaService.onModuleInit();
  service = new SmallGroupsService(prismaService);

  MANAGER_USER = {
    sub: 'não-usado-por-manager',
    tenant_id: tenantId,
    congregation_id: congregationId,
    roles: ['pastor'],
    plan: 'starter',
  };
}, 60_000);

afterAll(async () => {
  await prismaAdmin.groupMembership.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.smallGroup.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.person.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.groupType.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.tenant.deleteMany({ where: { id: tenantId } });
  await prismaAdmin.$disconnect();
  await prismaService.onModuleDestroy();
}, 60_000);

async function seedMotherWithMembers(): Promise<string> {
  const mother = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name: `Célula Mãe ${Date.now()}`,
      group_type_id: groupTypeId,
      leader_person_id: oldLeaderId,
    },
  });

  await prismaAdmin.groupMembership.createMany({
    data: [
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        small_group_id: mother.id,
        person_id: oldLeaderId,
        role: GroupMemberRole.leader,
      },
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        small_group_id: mother.id,
        person_id: member1Id,
        role: GroupMemberRole.member,
      },
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        small_group_id: mother.id,
        person_id: member2Id,
        role: GroupMemberRole.member,
      },
      {
        tenant_id: tenantId,
        congregation_id: congregationId,
        small_group_id: mother.id,
        person_id: member3Id,
        role: GroupMemberRole.member,
      },
    ],
  });

  return mother.id;
}

describe('SmallGroupsService.multiply — transação real, contra Postgres', () => {
  beforeEach(async () => {
    motherId = await seedMotherWithMembers();
  });

  it('Independent Test (P1): multiplica escolhendo 2 dos 3 membros e um novo líder', async () => {
    const child = await runAsTenant(tenantId, congregationId, (tx) =>
      prismaService.withTx(tx, () =>
        service.multiply(
          motherId,
          {
            name: 'Célula Filha',
            leader_person_id: newLeaderId,
            member_ids: [member1Id, member2Id],
          },
          MANAGER_USER,
        ),
      ),
    );

    expect(child.parent_group_id).toBe(motherId);
    expect(child.tenant_id).toBe(tenantId);
    expect(child.congregation_id).toBe(congregationId);
    expect(child.leader_person_id).toBe(newLeaderId);

    const [movedMember1, movedMember2, remainingMember3, leaderMembership] = await Promise.all([
      prismaAdmin.groupMembership.findUnique({
        where: { small_group_id_person_id: { small_group_id: child.id, person_id: member1Id } },
      }),
      prismaAdmin.groupMembership.findUnique({
        where: { small_group_id_person_id: { small_group_id: child.id, person_id: member2Id } },
      }),
      prismaAdmin.groupMembership.findUnique({
        where: { small_group_id_person_id: { small_group_id: motherId, person_id: member3Id } },
      }),
      prismaAdmin.groupMembership.findUnique({
        where: { small_group_id_person_id: { small_group_id: child.id, person_id: newLeaderId } },
      }),
    ]);

    expect(movedMember1).not.toBeNull();
    expect(movedMember2).not.toBeNull();
    expect(remainingMember3).not.toBeNull();
    expect(leaderMembership?.role).toBe(GroupMemberRole.leader);

    const stillInMother = await prismaAdmin.groupMembership.findUnique({
      where: { small_group_id_person_id: { small_group_id: motherId, person_id: member1Id } },
    });
    expect(stillInMother).toBeNull();
  });

  it('RLS isola: outro tenant não consegue multiplicar (nem ler) a célula mãe', async () => {
    const outroTenant = await prismaAdmin.tenant.create({
      data: { slug: `${slug}-outro`, name: 'Outro Tenant' },
    });
    const outraCong = await prismaAdmin.congregation.create({
      data: { tenant_id: outroTenant.id, name: 'Outro — Sede' },
    });

    try {
      await expect(
        runAsTenant(outroTenant.id, outraCong.id, (tx) =>
          prismaService.withTx(tx, () =>
            service.multiply(
              motherId,
              { name: 'Filha de outro tenant', leader_person_id: newLeaderId, member_ids: [] },
              { ...MANAGER_USER, tenant_id: outroTenant.id, congregation_id: outraCong.id },
            ),
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await prismaAdmin.congregation.deleteMany({ where: { tenant_id: outroTenant.id } });
      await prismaAdmin.tenant.deleteMany({ where: { id: outroTenant.id } });
    }
  });

  it('corrida: duas multiplicações concorrentes movendo o mesmo membro — a segunda falha com 400', async () => {
    await runAsTenant(tenantId, congregationId, (tx) =>
      prismaService.withTx(tx, () =>
        service.multiply(
          motherId,
          { name: 'Primeira filha', leader_person_id: newLeaderId, member_ids: [member1Id] },
          MANAGER_USER,
        ),
      ),
    );

    // member1Id já foi movido para a primeira filha — a segunda chamada
    // recontabiliza dentro da própria transação e não o encontra mais na mãe.
    await expect(
      runAsTenant(tenantId, congregationId, (tx) =>
        prismaService.withTx(tx, () =>
          service.multiply(
            motherId,
            { name: 'Segunda filha', leader_person_id: oldLeaderId, member_ids: [member1Id] },
            MANAGER_USER,
          ),
        ),
      ),
    ).rejects.toThrow();
  });
});
