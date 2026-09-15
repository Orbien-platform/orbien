/**
 * `SmallGroupsService.getHierarchy` usa `$queryRaw` com uma CTE recursiva —
 * não se testa com mock (ver docs/TESTES.md, Fase 5). Este teste roda contra
 * o Postgres efêmero, sob RLS real, reusando `test/helpers/rls.ts`.
 *
 * PROD-20 (CEL20-06) estendeu o retorno para `{ ancestors, tree }`, cada nó
 * com `health_status` — as asserções abaixo foram adaptadas para o novo
 * shape, mantendo toda cobertura que já existia (árvore completa, subárvore
 * a partir de um nó intermediário, grupo inexistente, isolamento por RLS) e
 * somando um teste novo de ancestrais em 2+ gerações.
 *
 * Uso: DATABASE_URL=... DIRECT_URL=... npm run test:integration -w orbien-backend
 */

import { PrismaService } from '../../src/prisma/prisma.service';
import { SmallGroupsService } from '../../src/small-groups/small-groups.service';
import { prismaAdmin, runAsTenant } from '../helpers/rls';

const ts = Date.now();
const slug = `sg-hier-${ts}`;

let prismaService: PrismaService;
let service: SmallGroupsService;

let tenantId: string;
let congregationId: string;
let groupTypeId: string;
let leaderId: string;
let rootId: string;
let childId: string;
let grandchildId: string;

beforeAll(async () => {
  const tenant = await prismaAdmin.tenant.create({ data: { slug, name: 'Tenant Hierarquia' } });
  tenantId = tenant.id;

  const cong = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantId, name: 'Hierarquia — Sede' },
  });
  congregationId = cong.id;

  const groupType = await prismaAdmin.groupType.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: 'Célula' },
  });
  groupTypeId = groupType.id;

  const leader = await prismaAdmin.person.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, full_name: 'Líder da Rede' },
  });
  leaderId = leader.id;

  const root = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name: 'Rede Central',
      group_type_id: groupTypeId,
      leader_person_id: leaderId,
    },
  });
  rootId = root.id;

  const child = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name: 'Célula Bairro A',
      group_type_id: groupTypeId,
      leader_person_id: leaderId,
      parent_group_id: rootId,
    },
  });
  childId = child.id;

  const grandchild = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name: 'Subcélula Bairro A',
      group_type_id: groupTypeId,
      leader_person_id: leaderId,
      parent_group_id: childId,
    },
  });
  grandchildId = grandchild.id;

  prismaService = new PrismaService();
  await prismaService.onModuleInit();
  service = new SmallGroupsService(prismaService);
}, 60_000);

afterAll(async () => {
  await prismaAdmin.smallGroup.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.person.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.groupType.deleteMany({ where: { tenant_id: tenantId } });
  await prismaAdmin.tenant.deleteMany({ where: { id: tenantId } });
  await prismaAdmin.$disconnect();
  await prismaService.onModuleDestroy();
}, 60_000);

describe('SmallGroupsService.getHierarchy — $queryRaw recursivo, contra RLS real', () => {
  it('a partir da raiz: sem ancestrais, árvore completa (raiz → filho → neto), todos red (nunca se reuniram)', async () => {
    const result = await runAsTenant(tenantId, congregationId, (tx) =>
      prismaService.withTx(tx, () => service.getHierarchy(rootId)),
    );

    expect(result.ancestors).toEqual([]);
    expect(result.tree?.id).toBe(rootId);
    expect(result.tree?.generation).toBe(0);
    expect(result.tree?.health_status).toBe('red');
    expect(result.tree?.children).toHaveLength(1);
    expect(result.tree?.children[0]?.id).toBe(childId);
    expect(result.tree?.children[0]?.generation).toBe(1);
    expect(result.tree?.children[0]?.children).toHaveLength(1);
    expect(result.tree?.children[0]?.children[0]?.id).toBe(grandchildId);
    expect(result.tree?.children[0]?.children[0]?.generation).toBe(2);
    expect(result.tree?.children[0]?.children[0]?.children).toEqual([]);
  });

  it('a partir de um nó intermediário: 1 ancestral (a raiz) e a subárvore abaixo dele', async () => {
    const result = await runAsTenant(tenantId, congregationId, (tx) =>
      prismaService.withTx(tx, () => service.getHierarchy(childId)),
    );

    expect(result.ancestors).toEqual([
      expect.objectContaining({ id: rootId, generation: -1 }),
    ]);
    expect(result.tree?.id).toBe(childId);
    expect(result.tree?.generation).toBe(0);
    expect(result.tree?.children).toHaveLength(1);
    expect(result.tree?.children[0]?.id).toBe(grandchildId);
  });

  it('a partir do neto: 2 ancestrais (pai e avô), mais próximo primeiro (CEL20-06)', async () => {
    const result = await runAsTenant(tenantId, congregationId, (tx) =>
      prismaService.withTx(tx, () => service.getHierarchy(grandchildId)),
    );

    expect(result.ancestors).toHaveLength(2);
    expect(result.ancestors[0]).toEqual(
      expect.objectContaining({ id: childId, generation: -1 }),
    );
    expect(result.ancestors[1]).toEqual(
      expect.objectContaining({ id: rootId, generation: -2 }),
    );
    expect(result.tree?.id).toBe(grandchildId);
    expect(result.tree?.children).toEqual([]);
  });

  it('retorna ancestors: [] e tree: null quando o grupo não existe (ou pertence a outro tenant, via RLS)', async () => {
    const result = await runAsTenant(tenantId, congregationId, (tx) =>
      prismaService.withTx(tx, () => service.getHierarchy('00000000-0000-4000-8000-000000000000')),
    );

    expect(result).toEqual({ ancestors: [], tree: null });
  });

  it('RLS isola: sob outro tenant, o mesmo id não é visível', async () => {
    const outroTenant = await prismaAdmin.tenant.create({
      data: { slug: `${slug}-outro`, name: 'Outro Tenant' },
    });
    const outraCong = await prismaAdmin.congregation.create({
      data: { tenant_id: outroTenant.id, name: 'Outro — Sede' },
    });

    try {
      const result = await runAsTenant(outroTenant.id, outraCong.id, (tx) =>
        prismaService.withTx(tx, () => service.getHierarchy(rootId)),
      );

      expect(result).toEqual({ ancestors: [], tree: null });
    } finally {
      await prismaAdmin.congregation.deleteMany({ where: { tenant_id: outroTenant.id } });
      await prismaAdmin.tenant.deleteMany({ where: { id: outroTenant.id } });
    }
  });
});
