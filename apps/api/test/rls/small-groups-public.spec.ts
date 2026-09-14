/**
 * RLS — plano público de "Encontre uma célula" (PROD-13)
 *
 * SECURITY INVARIANT: falha aqui é brecha real. Não ajuste asserção para
 * passar — mesmo contrato do cabeçalho de isolation.spec.ts.
 *
 * A página é sem login: não há JWT, o TenantContextInterceptor não roda e
 * `PublicSmallGroupsService` fixa o contexto que a policy vai ler — tenant
 * resolvido pelo slug, e a congregação só depois, tirada da própria célula.
 * O que este arquivo prova é o tamanho exato dessa abertura:
 *
 *   (a) o plano público lê célula `is_public` do tenant pedido, inclusive de
 *       outra congregação — é o ponto da tela, e é o que a policy de
 *       congregação sozinha impediria;
 *   (b) não lê célula não pública, nem célula pública de outro tenant;
 *   (c) não escreve em `small_groups` — o ramo público é FOR SELECT;
 *   (c2) enxerga o tipo e a congregação DA célula pública, e só eles: tipo sem
 *       célula pública e congregação sem célula pública seguem invisíveis;
 *   (d) grava pedido de visita na congregação fixada, e não em outra;
 *   (e) não LÊ pedido de visita nenhum, nem os que acabou de gravar;
 *   (f) a liderança autenticada da congregação lê os pedidos dela, e a
 *       congregação irmã do mesmo tenant não lê.
 */

import { prisma, prismaAdmin, runAsPublic, runAsUser } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congB1Id: string;

let groupTypeAId: string;
let unusedGroupTypeAId: string;
let groupTypeBId: string;
let leaderAId: string;
let leaderBId: string;

let publicGroupA1Id: string;
let publicGroupA2Id: string;
let privateGroupA1Id: string;
let publicGroupB1Id: string;

// Conta autenticada da congregação A1 — `runAsUser`, e não
// `runAsTenantWithRole`, porque a policy dos pedidos exige
// `app_current_user() IS NOT NULL`: é exatamente o que separa o produto
// autenticado do plano público, e o helper sem `app.user_id` não o alcança.
let userA1Id: string;

async function seedTenant(slug: string, name: string) {
  const tenant = await prismaAdmin.tenant.create({ data: { slug, name } });
  const congregation = await prismaAdmin.congregation.create({
    data: { tenant_id: tenant.id, name: `${name} — Sede` },
  });
  return { tenantId: tenant.id, congregationId: congregation.id };
}

async function seedGroup(
  tenantId: string,
  congregationId: string,
  groupTypeId: string,
  leaderId: string,
  name: string,
  isPublic: boolean,
) {
  const group = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name,
      group_type_id: groupTypeId,
      leader_person_id: leaderId,
      is_public: isPublic,
    },
  });
  return group.id;
}

beforeAll(async () => {
  const a = await seedTenant(`celulas-a-${ts}`, 'Igreja A (células públicas)');
  tenantAId = a.tenantId;
  congA1Id = a.congregationId;

  const congA2 = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantAId, name: 'Igreja A — Bairro' },
  });
  congA2Id = congA2.id;

  const b = await seedTenant(`celulas-b-${ts}`, 'Igreja B (células públicas)');
  tenantBId = b.tenantId;
  congB1Id = b.congregationId;

  const [groupTypeA, groupTypeB] = await Promise.all([
    prismaAdmin.groupType.create({
      data: { tenant_id: tenantAId, congregation_id: congA1Id, name: 'Célula' },
    }),
    prismaAdmin.groupType.create({
      data: { tenant_id: tenantBId, congregation_id: congB1Id, name: 'Célula' },
    }),
  ]);
  groupTypeAId = groupTypeA.id;
  groupTypeBId = groupTypeB.id;

  const unusedType = await prismaAdmin.groupType.create({
    data: { tenant_id: tenantAId, congregation_id: congA1Id, name: 'Tipo sem célula pública' },
  });
  unusedGroupTypeAId = unusedType.id;

  const [leaderA, leaderB] = await Promise.all([
    prismaAdmin.person.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA1Id,
        full_name: 'Líder A (RLS público)',
        classification: 'member',
      },
    }),
    prismaAdmin.person.create({
      data: {
        tenant_id: tenantBId,
        congregation_id: congB1Id,
        full_name: 'Líder B (RLS público)',
        classification: 'member',
      },
    }),
  ]);
  leaderAId = leaderA.id;
  leaderBId = leaderB.id;

  const accountA1 = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congA1Id,
      person_id: leaderA.id,
      email: `lider-a1-${ts}@exemplo.com`,
      password_hash: 'x',
      is_active: true,
    },
  });
  userA1Id = accountA1.id;

  publicGroupA1Id = await seedGroup(
    tenantAId, congA1Id, groupTypeAId, leaderAId, 'A1 — pública', true,
  );
  publicGroupA2Id = await seedGroup(
    tenantAId, congA2Id, groupTypeAId, leaderAId, 'A2 — pública (outra congregação)', true,
  );
  privateGroupA1Id = await seedGroup(
    tenantAId, congA1Id, groupTypeAId, leaderAId, 'A1 — privada', false,
  );
  publicGroupB1Id = await seedGroup(
    tenantBId, congB1Id, groupTypeBId, leaderBId, 'B1 — pública', true,
  );
});

afterAll(async () => {
  await prismaAdmin.smallGroupVisitRequest.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
  await prisma.$disconnect();
});

describe('leitura pública de células', () => {
  it('lê as células públicas do tenant, inclusive de outra congregação', async () => {
    const ids = await runAsPublic(tenantAId, async (tx) => {
      const groups = await tx.smallGroup.findMany({
        where: { tenant_id: tenantAId },
        select: { id: true },
      });
      return groups.map((g) => g.id);
    });

    expect(ids).toContain(publicGroupA1Id);
    expect(ids).toContain(publicGroupA2Id);
  });

  it('não lê célula não pública do mesmo tenant', async () => {
    const ids = await runAsPublic(tenantAId, async (tx) => {
      const groups = await tx.smallGroup.findMany({ select: { id: true } });
      return groups.map((g) => g.id);
    });

    expect(ids).not.toContain(privateGroupA1Id);
  });

  it('não lê célula pública de outro tenant', async () => {
    const ids = await runAsPublic(tenantAId, async (tx) => {
      const groups = await tx.smallGroup.findMany({ select: { id: true } });
      return groups.map((g) => g.id);
    });

    expect(ids).not.toContain(publicGroupB1Id);
  });

  it('enxerga o tipo da célula pública, e só ele', async () => {
    const ids = await runAsPublic(tenantAId, async (tx) => {
      const types = await tx.groupType.findMany({ select: { id: true } });
      return types.map((t) => t.id);
    });

    expect(ids).toEqual([groupTypeAId]);
    expect(ids).not.toContain(unusedGroupTypeAId);
  });

  it('enxerga as congregações que têm célula pública, e não as de outro tenant', async () => {
    const ids = await runAsPublic(tenantAId, async (tx) => {
      const congs = await tx.congregation.findMany({ select: { id: true } });
      return congs.map((c) => c.id);
    });

    expect(ids.sort()).toEqual([congA1Id, congA2Id].sort());
    expect(ids).not.toContain(congB1Id);
  });

  it('não escreve em small_groups — o ramo público é só de leitura', async () => {
    await expect(
      runAsPublic(tenantAId, (tx) =>
        tx.smallGroup.update({
          where: { id: publicGroupA1Id },
          data: { name: 'renomeada por quem não tem login' },
        }),
      ),
    ).rejects.toThrow();

    const group = await prismaAdmin.smallGroup.findUnique({ where: { id: publicGroupA1Id } });
    expect(group!.name).toBe('A1 — pública');
  });
});

describe('pedido de visita', () => {
  it('o plano público grava na congregação fixada no contexto', async () => {
    await runAsPublic(
      tenantAId,
      (tx) => tx.$executeRaw`
        INSERT INTO small_group_visit_requests
          (id, tenant_id, congregation_id, small_group_id, visitor_name, visitor_phone)
        VALUES
          (gen_random_uuid()::text, ${tenantAId}, ${congA1Id}, ${publicGroupA1Id},
           'Maria Pública', '11999990000')
      `,
      congA1Id,
    );

    const saved = await prismaAdmin.smallGroupVisitRequest.findMany({
      where: { small_group_id: publicGroupA1Id },
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].congregation_id).toBe(congA1Id);
  });

  it('não grava numa congregação diferente da que está no contexto', async () => {
    await expect(
      runAsPublic(
        tenantAId,
        (tx) => tx.$executeRaw`
          INSERT INTO small_group_visit_requests
            (id, tenant_id, congregation_id, small_group_id, visitor_name, visitor_phone)
          VALUES
            (gen_random_uuid()::text, ${tenantAId}, ${congA2Id}, ${publicGroupA2Id},
             'Pedido forjado', '11999990000')
        `,
        congA1Id,
      ),
    ).rejects.toThrow();
  });

  it('não grava para outro tenant', async () => {
    await expect(
      runAsPublic(
        tenantAId,
        (tx) => tx.$executeRaw`
          INSERT INTO small_group_visit_requests
            (id, tenant_id, congregation_id, small_group_id, visitor_name, visitor_phone)
          VALUES
            (gen_random_uuid()::text, ${tenantBId}, ${congB1Id}, ${publicGroupB1Id},
             'Pedido forjado', '11999990000')
        `,
        congB1Id,
      ),
    ).rejects.toThrow();
  });

  it('o plano público não LÊ pedido nenhum, nem na congregação que acabou de escrever', async () => {
    const rows = await runAsPublic(
      tenantAId,
      (tx) => tx.smallGroupVisitRequest.findMany(),
      congA1Id,
    );

    expect(rows).toHaveLength(0);
  });

  it('a liderança autenticada da congregação lê os pedidos dela', async () => {
    const rows = await runAsUser(tenantAId, congA1Id, userA1Id, (tx) =>
      tx.smallGroupVisitRequest.findMany({ where: { small_group_id: publicGroupA1Id } }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].visitor_name).toBe('Maria Pública');
  });

  it('a congregação irmã do mesmo tenant não lê os pedidos da outra', async () => {
    const rows = await runAsUser(tenantAId, congA2Id, userA1Id, (tx) =>
      tx.smallGroupVisitRequest.findMany(),
    );

    expect(rows).toHaveLength(0);
  });
});
