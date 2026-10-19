/**
 * RLS — contagem de público do culto (PRES)
 *
 * `celebration_attendance` é tabela NOVA e nasceu com escopo de CONGREGAÇÃO
 * (`026_rls_celebration_attendance.sql`, AD-001). Sem o script, `app_user`
 * leria — e sobrescreveria — a contagem de qualquer outra igreja.
 *
 * Duas congregações do MESMO tenant (o caso que só tenant_id deixaria passar)
 * e um segundo tenant. Tenants descartáveis, criados e apagados aqui.
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congBId: string;
let instA1: string;
let instA2: string;
let instA1Empty: string;
let attA2Id: string;

async function instance(tenantId: string, congregationId: string, tag: string): Promise<string> {
  const scope = { tenant_id: tenantId, congregation_id: congregationId };
  const celebration = await prismaAdmin.celebration.create({
    data: { ...scope, name: `Culto ${tag}`, type: 'sunday_service', start_time: '09:30', recurrence: 'none' },
  });
  const inst = await prismaAdmin.celebrationInstance.create({
    data: { ...scope, celebration_id: celebration.id, scheduled_date: new Date() },
  });
  return inst.id;
}

const counts = { children: 1, members: 2, attendees: 3, visitors: 4, updated_by: 'u' };

beforeAll(async () => {
  tenantAId = (await prismaAdmin.tenant.create({ data: { slug: `att-a-${ts}`, name: 'Tenant A (presença)' } })).id;
  congA1Id = (await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })).id;
  congA2Id = (await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Filial' } })).id;
  tenantBId = (await prismaAdmin.tenant.create({ data: { slug: `att-b-${ts}`, name: 'Tenant B (presença)' } })).id;
  congBId = (await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } })).id;

  instA1 = await instance(tenantAId, congA1Id, 'A1');
  instA2 = await instance(tenantAId, congA2Id, 'A2');
  instA1Empty = await instance(tenantAId, congA1Id, 'A1b');
  const instB = await instance(tenantBId, congBId, 'B');

  await prismaAdmin.celebrationAttendance.create({
    data: { ...counts, tenant_id: tenantAId, congregation_id: congA1Id, celebration_instance_id: instA1 },
  });
  attA2Id = (
    await prismaAdmin.celebrationAttendance.create({
      data: { ...counts, tenant_id: tenantAId, congregation_id: congA2Id, celebration_instance_id: instA2 },
    })
  ).id;
  await prismaAdmin.celebrationAttendance.create({
    data: { ...counts, tenant_id: tenantBId, congregation_id: congBId, celebration_instance_id: instB },
  });
}, 60_000);

afterAll(async () => {
  const tenants = { tenant_id: { in: [tenantAId, tenantBId] } };
  await prismaAdmin.celebration.deleteMany({ where: tenants });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('celebration_attendance — isolamento', () => {
  it('a congregação vê a própria contagem (controle positivo)', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.celebrationAttendance.findUnique({ where: { celebration_instance_id: instA1 } }),
    );
    expect(row?.members).toBe(2);
  });

  it('a congregação IRMÃ, do mesmo tenant, não vê', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.celebrationAttendance.findUnique({ where: { id: attA2Id } }),
    );
    expect(row).toBeNull();
  });

  it('o outro tenant não vê nada de A', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congBId, (tx) =>
      tx.celebrationAttendance.findMany({ where: { tenant_id: tenantAId } }),
    );
    expect(rows).toHaveLength(0);
  });

  it('gravar contagem na congregação alheia é negado — WITH CHECK igual ao USING', async () => {
    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.celebrationAttendance.create({
          data: { ...counts, tenant_id: tenantAId, congregation_id: congA2Id, celebration_instance_id: instA1Empty },
        }),
      ),
    ).rejects.toThrow();
  });

  it('corrigir (UPDATE) a contagem da congregação irmã não atinge linha nenhuma', async () => {
    const { count } = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.celebrationAttendance.updateMany({ where: { id: attA2Id }, data: { visitors: 999 } }),
    );
    expect(count).toBe(0);
  });
});
