/**
 * RLS — módulo Kids (KIDS-01, AD-001, AD-013)
 *
 * `kids_rooms`, `kids_sessions`, `kids_guardians` e `kids_checkins` nasceram
 * com escopo de CONGREGAÇÃO (`028_rls_kids.sql`). Sem o script, `app_user`
 * leria — e escreveria — a ficha de criança de qualquer outra igreja.
 *
 * Duas congregações do MESMO tenant (o caso que só tenant_id deixaria passar)
 * e um segundo tenant. Tenants descartáveis, criados e apagados aqui.
 *
 * Também cobre o índice único parcial de check-in aberto (KIDS-08): uma
 * criança só pode estar presente uma vez por instância de culto.
 */

import { Prisma } from "@prisma/client";
import { prismaAdmin, runAsTenantWithRole } from "../helpers/rls";

const ts = Date.now();

type Side = {
  tenantId: string;
  congId: string;
  instanceId: string;
  instance2Id: string;
  childId: string;
  guardianId: string;
  roomId: string;
  sessionId: string;
  room2Id: string;
  session2Id: string;
  kidsGuardianId: string;
  checkinId: string;
  healthId: string;
};

let a1: Side;
let a2: Side;
let b: Side;
const tenantIds: string[] = [];

async function seed(
  tenantId: string,
  congId: string,
  tag: string,
): Promise<Side> {
  const scope = { tenant_id: tenantId, congregation_id: congId };
  const celebration = await prismaAdmin.celebration.create({
    data: {
      ...scope,
      name: `Culto ${tag}`,
      type: "sunday_service",
      start_time: "09:30",
      recurrence: "none",
    },
  });
  const instance = await prismaAdmin.celebrationInstance.create({
    data: {
      ...scope,
      celebration_id: celebration.id,
      scheduled_date: new Date(),
    },
  });
  const instance2 = await prismaAdmin.celebrationInstance.create({
    data: {
      ...scope,
      celebration_id: celebration.id,
      scheduled_date: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  const child = await prismaAdmin.person.create({
    data: { ...scope, full_name: `Criança ${tag}`, is_child: true },
  });
  const guardian = await prismaAdmin.person.create({
    data: { ...scope, full_name: `Responsável ${tag}` },
  });
  const room = await prismaAdmin.kidsRoom.create({
    data: {
      ...scope,
      name: `Turma ${tag}`,
      min_age_months: 24,
      max_age_months: 60,
    },
  });
  const room2 = await prismaAdmin.kidsRoom.create({
    data: {
      ...scope,
      name: `Turma 2 ${tag}`,
      min_age_months: 61,
      max_age_months: 120,
    },
  });
  const session = await prismaAdmin.kidsSession.create({
    data: { ...scope, celebration_instance_id: instance.id, room_id: room.id },
  });
  const session2 = await prismaAdmin.kidsSession.create({
    data: { ...scope, celebration_instance_id: instance.id, room_id: room2.id },
  });
  const kg = await prismaAdmin.kidsGuardian.create({
    data: {
      ...scope,
      child_id: child.id,
      guardian_person_id: guardian.id,
      relationship: "mãe",
    },
  });
  const checkin = await prismaAdmin.kidsCheckin.create({
    data: {
      ...scope,
      session_id: session.id,
      celebration_instance_id: instance.id,
      child_id: child.id,
      guardian_person_id: guardian.id,
      code: "K7M2",
      checked_in_by: "u",
    },
  });
  const health = await prismaAdmin.kidsChildHealth.create({
    data: { ...scope, person_id: child.id, allergies: `amendoim ${tag}` },
  });
  return {
    tenantId,
    congId,
    healthId: health.id,
    instanceId: instance.id,
    instance2Id: instance2.id,
    childId: child.id,
    guardianId: guardian.id,
    roomId: room.id,
    sessionId: session.id,
    room2Id: room2.id,
    session2Id: session2.id,
    kidsGuardianId: kg.id,
    checkinId: checkin.id,
  };
}

beforeAll(async () => {
  const tA = await prismaAdmin.tenant.create({
    data: { slug: `kids-a-${ts}`, name: "Tenant A (kids)" },
  });
  const tB = await prismaAdmin.tenant.create({
    data: { slug: `kids-b-${ts}`, name: "Tenant B (kids)" },
  });
  tenantIds.push(tA.id, tB.id);
  const cA1 = await prismaAdmin.congregation.create({
    data: { tenant_id: tA.id, name: "A — Sede" },
  });
  const cA2 = await prismaAdmin.congregation.create({
    data: { tenant_id: tA.id, name: "A — Filial" },
  });
  const cB = await prismaAdmin.congregation.create({
    data: { tenant_id: tB.id, name: "B — Sede" },
  });

  a1 = await seed(tA.id, cA1.id, "A1");
  a2 = await seed(tA.id, cA2.id, "A2");
  b = await seed(tB.id, cB.id, "B");
}, 60_000);

afterAll(async () => {
  const tenants = { tenant_id: { in: tenantIds } };
  await prismaAdmin.celebration.deleteMany({ where: tenants });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prismaAdmin.$disconnect();
}, 30_000);

type Tx = Prisma.TransactionClient;
type Row = { id: string } | null;
type Updated = { count: number };

/** As tabelas, com leitura por id, tentativa de escrita alheia e UPDATE. */
const tables: {
  name: string;
  find: (tx: Tx, id: string) => Promise<Row>;
  list: (tx: Tx, tenant_id: string) => Promise<unknown[]>;
  own: (s: Side) => string;
  create: (tx: Tx, s: Side) => Promise<unknown>;
  update: (tx: Tx, id: string) => Promise<Updated>;
}[] = [
  {
    name: "kids_rooms",
    find: (tx: Tx, id: string) => tx.kidsRoom.findUnique({ where: { id } }),
    list: (tx: Tx, tenant_id: string) =>
      tx.kidsRoom.findMany({ where: { tenant_id } }),
    own: (s: Side) => s.roomId,
    create: (tx: Tx, s: Side) =>
      tx.kidsRoom.create({
        data: {
          tenant_id: s.tenantId,
          congregation_id: s.congId,
          name: "Invasora",
          min_age_months: 0,
          max_age_months: 12,
        },
      }),
    update: (tx: Tx, id: string) =>
      tx.kidsRoom.updateMany({ where: { id }, data: { name: "Sequestrada" } }),
  },
  {
    name: "kids_sessions",
    find: (tx: Tx, id: string) => tx.kidsSession.findUnique({ where: { id } }),
    list: (tx: Tx, tenant_id: string) =>
      tx.kidsSession.findMany({ where: { tenant_id } }),
    own: (s: Side) => s.sessionId,
    create: (tx: Tx, s: Side) =>
      tx.kidsSession.create({
        data: {
          tenant_id: s.tenantId,
          congregation_id: s.congId,
          celebration_instance_id: s.instance2Id,
          room_id: s.roomId,
        },
      }),
    update: (tx: Tx, id: string) =>
      tx.kidsSession.updateMany({
        where: { id },
        data: { status: "cancelled" },
      }),
  },
  {
    name: "kids_guardians",
    find: (tx: Tx, id: string) => tx.kidsGuardian.findUnique({ where: { id } }),
    list: (tx: Tx, tenant_id: string) =>
      tx.kidsGuardian.findMany({ where: { tenant_id } }),
    own: (s: Side) => s.kidsGuardianId,
    create: (tx: Tx, s: Side) =>
      tx.kidsGuardian.create({
        data: {
          tenant_id: s.tenantId,
          congregation_id: s.congId,
          child_id: s.guardianId,
          guardian_person_id: s.childId,
          relationship: "tio",
        },
      }),
    update: (tx: Tx, id: string) =>
      tx.kidsGuardian.updateMany({
        where: { id },
        data: { can_pickup: false },
      }),
  },
  {
    name: "kids_checkins",
    find: (tx: Tx, id: string) => tx.kidsCheckin.findUnique({ where: { id } }),
    list: (tx: Tx, tenant_id: string) =>
      tx.kidsCheckin.findMany({ where: { tenant_id } }),
    own: (s: Side) => s.checkinId,
    create: (tx: Tx, s: Side) =>
      tx.kidsCheckin.create({
        data: {
          tenant_id: s.tenantId,
          congregation_id: s.congId,
          session_id: s.session2Id,
          celebration_instance_id: s.instanceId,
          child_id: s.childId,
          guardian_person_id: s.guardianId,
          code: "Z9Z9",
          checked_in_by: "u",
        },
      }),
    update: (tx: Tx, id: string) =>
      tx.kidsCheckin.updateMany({
        where: { id },
        data: { checked_out_by: "intruso" },
      }),
  },
  {
    name: "kids_child_health",
    find: (tx: Tx, id: string) => tx.kidsChildHealth.findUnique({ where: { id } }),
    list: (tx: Tx, tenant_id: string) =>
      tx.kidsChildHealth.findMany({ where: { tenant_id } }),
    own: (s: Side) => s.healthId,
    create: (tx: Tx, s: Side) =>
      tx.kidsChildHealth.create({
        data: {
          tenant_id: s.tenantId,
          congregation_id: s.congId,
          person_id: s.guardianId,
          allergies: "invasora",
        },
      }),
    update: (tx: Tx, id: string) =>
      tx.kidsChildHealth.updateMany({
        where: { id },
        data: { allergies: "sequestrada" },
      }),
  },
];

describe.each(tables)("$name — isolamento por congregação", (t) => {
  it("a congregação vê a própria linha (controle positivo)", async () => {
    const row = await runAsTenantWithRole(a1.tenantId, a1.congId, (tx) =>
      t.find(tx, t.own(a1)),
    );
    expect(row?.id).toBe(t.own(a1));
  });

  it("a congregação IRMÃ, do mesmo tenant, não vê", async () => {
    const row = await runAsTenantWithRole(a1.tenantId, a1.congId, (tx) =>
      t.find(tx, t.own(a2)),
    );
    expect(row).toBeNull();
  });

  it("o outro tenant não vê nada de A", async () => {
    const rows = await runAsTenantWithRole(b.tenantId, b.congId, (tx) =>
      t.list(tx, a1.tenantId),
    );
    expect(rows).toHaveLength(0);
  });

  it("gravar na congregação alheia (mesmo tenant) é negado — WITH CHECK igual ao USING", async () => {
    // Contexto A1, linha declarando congregação A2.
    await expect(
      runAsTenantWithRole(a1.tenantId, a1.congId, (tx) =>
        t.create(tx, { ...a2, tenantId: a1.tenantId }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("gravar em outro tenant é negado", async () => {
    // Contexto B, linha declarando tenant A.
    await expect(
      runAsTenantWithRole(b.tenantId, b.congId, (tx) => t.create(tx, a1)),
    ).rejects.toThrow(/row-level security/);
  });

  it("UPDATE na linha da congregação irmã não atinge linha nenhuma", async () => {
    const { count } = await runAsTenantWithRole(a1.tenantId, a1.congId, (tx) =>
      t.update(tx, t.own(a2)),
    );
    expect(count).toBe(0);
  });

  it("UPDATE na linha de outro tenant não atinge linha nenhuma", async () => {
    const { count } = await runAsTenantWithRole(b.tenantId, b.congId, (tx) =>
      t.update(tx, t.own(a1)),
    );
    expect(count).toBe(0);
  });
});

describe("kids_checkins — um check-in aberto por criança e culto (KIDS-08)", () => {
  const base = () => ({
    tenant_id: a1.tenantId,
    congregation_id: a1.congId,
    celebration_instance_id: a1.instanceId,
    child_id: a1.childId,
    guardian_person_id: a1.guardianId,
    checked_in_by: "u",
  });

  it("segundo check-in aberto da mesma criança no mesmo culto, em outra turma, devolve conflito (P2002)", async () => {
    await expect(
      prismaAdmin.kidsCheckin.create({
        data: { ...base(), session_id: a1.session2Id, code: "Q4Q4" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("o conflito também vale pelo caminho do app (RLS ligado)", async () => {
    await expect(
      runAsTenantWithRole(a1.tenantId, a1.congId, (tx) =>
        tx.kidsCheckin.create({
          data: { ...base(), session_id: a1.session2Id, code: "Q5Q5" },
        }),
      ),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("depois do check-out a criança pode entrar de novo no mesmo culto", async () => {
    await prismaAdmin.kidsCheckin.update({
      where: { id: a1.checkinId },
      data: { checked_out_at: new Date() },
    });
    const again = await prismaAdmin.kidsCheckin.create({
      data: { ...base(), session_id: a1.session2Id, code: "R6R6" },
    });
    expect(again.checked_out_at).toBeNull();
    // Restaura: devolve o estado aberto ao primeiro e remove o segundo.
    await prismaAdmin.kidsCheckin.delete({ where: { id: again.id } });
    await prismaAdmin.kidsCheckin.update({
      where: { id: a1.checkinId },
      data: { checked_out_at: null },
    });
  });

  it("check-in com instância diferente da sessão é recusado (FK composta)", async () => {
    await expect(
      prismaAdmin.kidsCheckin.create({
        data: {
          ...base(),
          celebration_instance_id: a1.instance2Id,
          session_id: a1.session2Id,
          code: "S7S7",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("kids_child_health — anonimizar a pessoa apaga o dado de saúde (LGPD Art. 11)", () => {
  it("o app (app_user) anonimiza a criança e a linha de saúde some; a pessoa permanece", async () => {
    const scope = { tenant_id: a1.tenantId, congregation_id: a1.congId };
    const kid = await prismaAdmin.person.create({
      data: { ...scope, full_name: "Criança anonimizável", is_child: true },
    });
    await prismaAdmin.kidsChildHealth.create({
      data: { ...scope, person_id: kid.id, allergies: "amendoim" },
    });

    await runAsTenantWithRole(a1.tenantId, a1.congId, (tx) =>
      tx.person.update({
        where: { id: kid.id },
        data: { full_name: "ANONIMIZADO", anonymized_at: new Date() },
      }),
    );

    expect(
      await prismaAdmin.kidsChildHealth.findUnique({ where: { person_id: kid.id } }),
    ).toBeNull();
    expect(await prismaAdmin.person.findUnique({ where: { id: kid.id } })).not.toBeNull();
  });

  it("atualizar a pessoa sem anonimizar não apaga a saúde", async () => {
    await runAsTenantWithRole(a1.tenantId, a1.congId, (tx) =>
      tx.person.update({ where: { id: a1.childId }, data: { full_name: "Criança A1 renomeada" } }),
    );
    expect(
      await prismaAdmin.kidsChildHealth.findUnique({ where: { id: a1.healthId } }),
    ).not.toBeNull();
  });
});
