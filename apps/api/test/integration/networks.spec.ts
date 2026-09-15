/**
 * CRUD de `Network` + `NetworksService.getGoalStatus`, ponta a ponta contra
 * Postgres real, sob RLS real (policy exige `app.user_id`, per
 * `test/rls/networks.spec.ts` — usamos `runAsUser`, não `runAsTenant`).
 *
 * Independent Test da história P3 (spec.md): rede com meta 80%, 5 células
 * (4 verdes, 1 vermelha) → current_pct 80/met true; mais uma vermelha (6
 * total) → current_pct 66.67/met false.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { PrismaService } from '../../src/prisma/prisma.service';
import { NetworksService } from '../../src/small-groups/networks.service';
import { JwtPayload } from '../../src/auth/interfaces/jwt-payload.interface';
import { prismaAdmin, runAsUser } from '../helpers/rls';

const ts = Date.now();
const slug = `net-int-${ts}`;

let prismaService: PrismaService;
let service: NetworksService;

let tenantId: string;
let congregationId: string;
let groupTypeId: string;
let leaderId: string;
let userId: string;

let USER: JwtPayload;

beforeAll(async () => {
  const tenant = await prismaAdmin.tenant.create({ data: { slug, name: 'Tenant Redes' } });
  tenantId = tenant.id;

  const cong = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantId, name: 'Redes — Sede' },
  });
  congregationId = cong.id;

  const groupType = await prismaAdmin.groupType.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Célula' },
  });
  groupTypeId = groupType.id;

  const leader = await prismaAdmin.person.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Líder' },
  });
  leaderId = leader.id;

  const account = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      email: `net-int-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  userId = account.id;

  prismaService = new PrismaService();
  await prismaService.onModuleInit();
  service = new NetworksService(prismaService);

  USER = {
    sub: userId,
    tenant_id: tenantId,
    congregation_id: congregationId,
    roles: ['pastor'],
    plan: 'premium',
  };
}, 60_000);

afterAll(async () => {
  await prismaAdmin.groupMembership.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.smallGroup.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.network.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.userAccount.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.person.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.groupType.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.tenant.deleteMany({ where: { id: tenantId } });
  await prismaAdmin.$disconnect();
  await prismaService.onModuleDestroy();
}, 60_000);

async function createGroup(name: string): Promise<string> {
  const group = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name,
      group_type_id: groupTypeId,
      leader_person_id: leaderId,
    },
  });
  return group.id;
}

async function registerRecentMeeting(groupId: string): Promise<void> {
  await prismaAdmin.groupMeeting.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      small_group_id: groupId,
      occurred_at: new Date(),
    },
  });
}

describe('Networks — CRUD e goal-status, contra Postgres real', () => {
  it('cria, lê, atualiza e remove uma rede', async () => {
    const created = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () =>
        service.create({ name: 'Rede Central', health_goal_pct: 80 }, USER),
      ),
    );
    expect(created.name).toBe('Rede Central');
    expect(created.tenant_id).toBe(tenantId);
    expect(created.congregation_id).toBe(congregationId);

    const found = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.findOne(created.id)),
    );
    expect(found.id).toBe(created.id);

    const updated = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.update(created.id, { name: 'Rede Renomeada' })),
    );
    expect(updated.name).toBe('Rede Renomeada');

    const all = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.findAll()),
    );
    expect(all.some((n) => n.id === created.id)).toBe(true);

    await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.remove(created.id)),
    );
    await expect(
      runAsUser(tenantId, congregationId, userId, (tx) =>
        prismaService.withTx(tx, () => service.findOne(created.id)),
      ),
    ).rejects.toThrow();
  });

  it('Independent Test (P3): meta 80% — 4 verdes/1 vermelha atinge; +1 vermelha não atinge', async () => {
    const network = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () =>
        service.create({ name: `Rede Meta ${ts}`, health_goal_pct: 80 }, USER),
      ),
    );

    const groupIds = await Promise.all([
      createGroup('Célula Verde 1'),
      createGroup('Célula Verde 2'),
      createGroup('Célula Verde 3'),
      createGroup('Célula Verde 4'),
      createGroup('Célula Vermelha 1'),
    ]);
    await prismaAdmin.smallGroup.updateMany({
      where: { id: { in: groupIds } },
      data: { network_id: network.id },
    });
    await Promise.all(groupIds.slice(0, 4).map((id) => registerRecentMeeting(id)));
    // groupIds[4] nunca se reuniu → red

    const statusMet = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.getGoalStatus(network.id)),
    );
    expect(statusMet).toEqual({
      goal_pct: 80,
      current_pct: 80,
      met: true,
      green: 4,
      yellow: 0,
      red: 1,
      total: 5,
    });

    const sixthGroupId = await createGroup('Célula Vermelha 2');
    await prismaAdmin.smallGroup.update({
      where: { id: sixthGroupId },
      data: { network_id: network.id },
    });

    const statusNotMet = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.getGoalStatus(network.id)),
    );
    expect(statusNotMet.current_pct).toBe(66.67);
    expect(statusNotMet.met).toBe(false);
    expect(statusNotMet.total).toBe(6);
  });

  it('AC4/AC5: rede sem meta e rede sem células', async () => {
    const semMeta = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.create({ name: `Rede Sem Meta ${ts}` }, USER)),
    );
    const groupId = await createGroup('Célula Sem Meta');
    await prismaAdmin.smallGroup.update({ where: { id: groupId }, data: { network_id: semMeta.id } });
    await registerRecentMeeting(groupId);

    const statusSemMeta = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.getGoalStatus(semMeta.id)),
    );
    expect(statusSemMeta.goal_pct).toBeNull();
    expect(statusSemMeta.met).toBeNull();
    expect(statusSemMeta.total).toBe(1);

    const semCelulas = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () =>
        service.create({ name: `Rede Sem Células ${ts}`, health_goal_pct: 50 }, USER),
      ),
    );
    const statusSemCelulas = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.getGoalStatus(semCelulas.id)),
    );
    expect(statusSemCelulas).toEqual({
      goal_pct: 50,
      current_pct: null,
      met: null,
      green: 0,
      yellow: 0,
      red: 0,
      total: 0,
    });
  });

  it('RLS isola: outro tenant não lê nem atualiza a rede', async () => {
    const network = await runAsUser(tenantId, congregationId, userId, (tx) =>
      prismaService.withTx(tx, () => service.create({ name: `Rede Isolada ${ts}` }, USER)),
    );

    const outroTenant = await prismaAdmin.tenant.create({
      data: { slug: `${slug}-outro`, name: 'Outro Tenant' },
    });
    const outraCong = await prismaAdmin.congregation.create({
      data: { tenant_id: outroTenant.id, name: 'Outro — Sede' },
    });
    const outroUser = await prismaAdmin.userAccount.create({
      data: {
        tenant_id: outroTenant.id,
        congregation_id: outraCong.id,
        email: `net-int-outro-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    });

    try {
      await expect(
        runAsUser(outroTenant.id, outraCong.id, outroUser.id, (tx) =>
          prismaService.withTx(tx, () => service.findOne(network.id)),
        ),
      ).rejects.toThrow();
    } finally {
      await prismaAdmin.userAccount.deleteMany({ where: { tenant_id: outroTenant.id } });
      await prismaAdmin.congregation.deleteMany({ where: { tenant_id: outroTenant.id } });
      await prismaAdmin.tenant.deleteMany({ where: { id: outroTenant.id } });
    }
  });
});
