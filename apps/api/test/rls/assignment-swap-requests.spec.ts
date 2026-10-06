/**
 * RLS — pedidos de troca de escala (v2, "Minhas escalas" → Trocas)
 *
 * `assignment_swap_requests` é tabela NOVA, e o que este arquivo mede é que
 * ela nasceu com a policy certa: escopo de CONGREGAÇÃO
 * (`025_rls_assignment_swap_requests.sql`, AD-001), o mesmo da atribuição a
 * que o pedido pertence. Sem o script, a tabela ficaria sem RLS e `app_user`
 * leria — e aceitaria — os pedidos de troca de qualquer outra igreja.
 *
 * Duas congregações do MESMO tenant, de propósito: o caso que só o
 * isolamento por tenant deixaria passar. Um segundo tenant cobre o eixo de
 * fora. Tenants descartáveis, criados e apagados aqui — não tocam nos de
 * teste nem em dado de cliente.
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congBId: string;

let reqA1Id: string;
let reqA2Id: string;
let fixtureA1: Fixture;

type Fixture = { assignmentId: string; profileId: string };

async function fixture(tenantId: string, congregationId: string, tag: string): Promise<Fixture> {
  const scope = { tenant_id: tenantId, congregation_id: congregationId };
  const person = await prismaAdmin.person.create({
    data: { ...scope, full_name: `Voluntário ${tag} ${ts}`, classification: 'member' },
  });
  const profile = await prismaAdmin.volunteerProfile.create({
    data: { ...scope, person_id: person.id, availability: {}, skills: [] },
  });
  const ministry = await prismaAdmin.ministry.create({ data: { ...scope, name: `Mídia ${tag}` } });
  const celebration = await prismaAdmin.celebration.create({
    data: { ...scope, name: `Culto ${tag}`, type: 'sunday_service', start_time: '09:30', recurrence: 'none' },
  });
  const instance = await prismaAdmin.celebrationInstance.create({
    data: { ...scope, celebration_id: celebration.id, scheduled_date: new Date(Date.now() + 7 * 86_400_000) },
  });
  const schedule = await prismaAdmin.celebrationSchedule.create({
    data: { ...scope, celebration_instance_id: instance.id, status: 'published' },
  });
  const slot = await prismaAdmin.celebrationMinistry.create({
    data: { ...scope, schedule_id: schedule.id, ministry_id: ministry.id },
  });
  const assignment = await prismaAdmin.celebrationAssignment.create({
    data: { ...scope, celebration_ministry_id: slot.id, volunteer_profile_id: profile.id },
  });
  return { assignmentId: assignment.id, profileId: profile.id };
}

async function swapRequest(tenantId: string, congregationId: string, f: Fixture): Promise<string> {
  const req = await prismaAdmin.assignmentSwapRequest.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      assignment_id: f.assignmentId,
      requester_profile_id: f.profileId,
    },
  });
  return req.id;
}

beforeAll(async () => {
  tenantAId = (
    await prismaAdmin.tenant.create({ data: { slug: `swap-a-${ts}`, name: 'Tenant A (trocas)' } })
  ).id;
  congA1Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })
  ).id;
  congA2Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Filial' } })
  ).id;
  tenantBId = (
    await prismaAdmin.tenant.create({ data: { slug: `swap-b-${ts}`, name: 'Tenant B (trocas)' } })
  ).id;
  congBId = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } })
  ).id;

  fixtureA1 = await fixture(tenantAId, congA1Id, 'A1');
  const fixtureA2 = await fixture(tenantAId, congA2Id, 'A2');
  const fixtureB = await fixture(tenantBId, congBId, 'B');

  reqA1Id = await swapRequest(tenantAId, congA1Id, fixtureA1);
  reqA2Id = await swapRequest(tenantAId, congA2Id, fixtureA2);
  await swapRequest(tenantBId, congBId, fixtureB);
}, 60_000);

afterAll(async () => {
  // `celebration_ministries → ministries` e `celebration_assignments →
  // volunteer_profiles` são Restrict: o culto (e, em cascata, escala, vaga,
  // atribuição e pedido) sai antes; o resto vai no cascade do tenant.
  const tenants = { tenant_id: { in: [tenantAId, tenantBId] } };
  await prismaAdmin.celebration.deleteMany({ where: tenants });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('assignment_swap_requests — isolamento', () => {
  it('a congregação vê o próprio pedido (controle positivo)', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.assignmentSwapRequest.findUnique({ where: { id: reqA1Id } }),
    );
    expect(row?.assignment_id).toBe(fixtureA1.assignmentId);
  });

  it('a congregação IRMÃ, do mesmo tenant, não vê — é o caso que só tenant_id deixaria passar', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.assignmentSwapRequest.findUnique({ where: { id: reqA2Id } }),
    );
    expect(row).toBeNull();
  });

  it('o outro tenant não vê nada de A', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congBId, (tx) =>
      tx.assignmentSwapRequest.findMany({ where: { tenant_id: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it('gravar pedido na congregação alheia é negado — o WITH CHECK diz o mesmo que o USING', async () => {
    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.assignmentSwapRequest.create({
          data: {
            tenant_id: tenantAId,
            congregation_id: congA2Id,
            assignment_id: fixtureA1.assignmentId,
            requester_profile_id: fixtureA1.profileId,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('aceitar (UPDATE) o pedido da congregação irmã não atinge linha nenhuma', async () => {
    const { count } = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.assignmentSwapRequest.updateMany({
        where: { id: reqA2Id },
        data: { status: 'accepted' },
      }),
    );
    expect(count).toBe(0);
  });

  it('um segundo pedido em aberto para a mesma escala é recusado pelo índice parcial', async () => {
    await expect(swapRequest(tenantAId, congA1Id, fixtureA1)).rejects.toThrow();
  });
});
