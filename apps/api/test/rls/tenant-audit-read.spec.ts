/**
 * RLS — a igreja lê a própria auditoria (`PROD-21`)
 *
 * A rota `GET /audit-logs` é de tenant, não de plataforma: ela não passa
 * `tenant_id` nenhum para o Postgres além do contexto do
 * `TenantContextInterceptor`, e quem recorta as linhas é a policy
 * `tenant_read` de `audit_logs` (001, ampliada por 005). O `where` do serviço
 * repete o tenant por redundância — mas se a policy não fizesse o trabalho, a
 * redundância seria a única coisa entre o dado de uma igreja e a tela de
 * outra. É isso que este arquivo mede, e por isso as asserções leem SEM
 * filtro de `tenant_id`.
 *
 * Duas coisas separam este arquivo de `isolation.spec.ts`: as linhas nascem
 * por `audit_insert()` (SECURITY DEFINER — `audit_logs` não aceita INSERT de
 * `app_user`, ver 001 grupo 8), e o ator de metade delas é um
 * `platform_support` que não pertence ao tenant que lê, que é exatamente o
 * caso em que o `actor_name_snapshot` (AD-004) precisa existir.
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congregationAId: string;
let tenantBId: string;
let congregationBId: string;
let actorAId: string;
let actorBId: string;

async function insertAudit(
  tenantId: string,
  congregationId: string,
  actorUserId: string,
  entity: string,
  action: string,
  actorName: string | null,
): Promise<void> {
  await prismaAdmin.$executeRaw`
    SELECT audit_insert(
      ${tenantId}::text,
      ${congregationId}::text,
      ${actorUserId}::text,
      NULL::text,
      ${entity}::text,
      ${action}::text,
      NULL::jsonb,
      ${JSON.stringify({ route: entity, method: 'GET', status: 200 })}::jsonb,
      NULL::text,
      NULL::text,
      ${actorName}::text
    )
  `;
}

beforeAll(async () => {
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `audit-a-${ts}`, name: 'Tenant A (auditoria)' },
  });
  tenantAId = tenantA.id;
  const congA = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantAId, name: 'A — Sede' },
  });
  congregationAId = congA.id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `audit-b-${ts}`, name: 'Tenant B (auditoria)' },
  });
  tenantBId = tenantB.id;
  const congB = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantBId, name: 'B — Sede' },
  });
  congregationBId = congB.id;

  const actorA = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      email: `audit-actor-a-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  actorAId = actorA.id;

  const actorB = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      email: `audit-actor-b-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  actorBId = actorB.id;

  await insertAudit(tenantAId, congregationAId, actorAId, '/persons', 'support_access', 'Ana Suporte');
  await insertAudit(tenantBId, congregationBId, actorBId, '/financial', 'support_access', 'Bruno Suporte');
}, 60_000);

afterAll(async () => {
  await prismaAdmin.auditLog.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.userAccount.deleteMany({ where: { id: { in: [actorAId, actorBId] } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('audit_logs — leitura escopada ao tenant (PROD-21)', () => {
  it('o tenant vê a própria linha de auditoria (controle positivo)', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congregationAId, (tx) =>
      tx.auditLog.findMany({ where: { entity: '/persons' } }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.tenant_id).toBe(tenantAId);
  });

  it('o tenant NÃO vê a linha do outro tenant, mesmo consultando por entity', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congregationAId, (tx) =>
      tx.auditLog.findMany({ where: { entity: '/financial' } }),
    );

    expect(rows).toHaveLength(0);
  });

  it('listagem ampla, sem where de tenant, só traz linhas do tenant do contexto', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congregationAId, (tx) =>
      tx.auditLog.findMany(),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === tenantAId)).toBe(true);
  });

  it('o nome do autor vem do snapshot — a linha o traz mesmo sem join possível', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congregationAId, (tx) =>
      tx.auditLog.findMany({ where: { entity: '/persons' } }),
    );

    expect(rows[0]!.actor_name_snapshot).toBe('Ana Suporte');
  });

  it('a escrita continua fechada: `app_user` não insere em audit_logs direto', async () => {
    await expect(
      runAsTenantWithRole(tenantAId, congregationAId, (tx) =>
        tx.auditLog.create({
          data: {
            tenant_id: tenantAId,
            congregation_id: congregationAId,
            actor_user_id: actorAId,
            entity: '/forjado',
            action: 'support_access',
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
