/**
 * RLS — check-in de encontro por QR (PROD-12)
 *
 * `meeting_checkin_tokens` é tabela NOVA, e o que este arquivo mede é que ela
 * nasceu com a policy certa: escopo de CONGREGAÇÃO
 * (`018_rls_meeting_checkin_tokens.sql`, Padrão B — o mesmo de
 * `012_rls_group_messages.sql`, já usado no módulo). Sem o script, a tabela
 * ficaria sem RLS e `app_user` — que tem GRANT em tudo em `public` por ALTER
 * DEFAULT PRIVILEGES — leria (e giraria) o token de check-in de qualquer
 * outra igreja.
 *
 * Duas congregações do MESMO tenant, de propósito: o caso que só o
 * isolamento por tenant deixaria passar. Uma terceira congregação de outro
 * tenant cobre o eixo de fora.
 *
 * `runAsTenantWithRole`, não `runAsUser`: a policy é o Padrão B simples, sem
 * `app_current_user() IS NOT NULL` — quem decide se o token vale
 * (`expires_at`) e se quem escaneia tem `GroupMembership` real é o
 * `MeetingsService`, não a policy. Isso é testado em `meetings.service.spec.ts`.
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congBId: string;

let userA1Id: string;

let tokenA1Id: string;
let tokenA2Id: string;
let meetingA2NoTokenId: string;

async function createMeeting(
  tenantId: string,
  congregationId: string,
  userId: string,
  label: string,
  withToken = true,
) {
  const groupType = await prismaAdmin.groupType.create({
    data: { tenant_id: tenantId, congregation_id: congregationId, name: `Tipo ${label}` },
  });
  const leader = await prismaAdmin.person.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      full_name: `Líder ${label}`,
      classification: 'member',
      gender: 'male',
    },
  });
  const group = await prismaAdmin.smallGroup.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      name: `Célula ${label}`,
      group_type_id: groupType.id,
      leader_person_id: leader.id,
    },
  });
  const meeting = await prismaAdmin.groupMeeting.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      small_group_id: group.id,
      occurred_at: new Date(),
    },
  });
  if (!withToken) {
    return { checkinTokenId: null, meetingId: meeting.id };
  }
  const checkinToken = await prismaAdmin.meetingCheckinToken.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      group_meeting_id: meeting.id,
      token: `tok-${label}-${ts}`,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      created_by: userId,
    },
  });
  return { checkinTokenId: checkinToken.id, meetingId: meeting.id };
}

beforeAll(async () => {
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `checkin-a-${ts}`, name: 'Tenant A (checkin QR)' },
  });
  tenantAId = tenantA.id;
  congA1Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })
  ).id;
  congA2Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Filial' } })
  ).id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `checkin-b-${ts}`, name: 'Tenant B (checkin QR)' },
  });
  tenantBId = tenantB.id;
  congBId = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } })
  ).id;

  userA1Id = (
    await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA1Id,
        email: `checkin-a1-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    })
  ).id;
  const userBId = (
    await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantBId,
        congregation_id: congBId,
        email: `checkin-b-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    })
  ).id;

  tokenA1Id = (await createMeeting(tenantAId, congA1Id, userA1Id, 'A-Sede')).checkinTokenId!;
  const meetingA2 = await createMeeting(tenantAId, congA2Id, userA1Id, 'A-Filial');
  tokenA2Id = meetingA2.checkinTokenId!;
  meetingA2NoTokenId = (
    await createMeeting(tenantAId, congA2Id, userA1Id, 'A-Filial-2', false)
  ).meetingId;
  await createMeeting(tenantBId, congBId, userBId, 'B-Sede');
}, 60_000);

afterAll(async () => {
  await prismaAdmin.meetingCheckinToken.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.groupMeeting.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.smallGroup.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.groupType.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.person.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.userAccount.deleteMany({ where: { tenant_id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('meeting_checkin_tokens — isolamento (PROD-12)', () => {
  it('a congregação vê o próprio token de check-in (controle positivo)', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.meetingCheckinToken.findUnique({ where: { id: tokenA1Id } }),
    );

    expect(row).not.toBeNull();
  });

  it('a congregação IRMÃ, do mesmo tenant, não vê — é o caso que só tenant_id deixaria passar', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.meetingCheckinToken.findUnique({ where: { id: tokenA2Id } }),
    );

    expect(row).toBeNull();
  });

  it('listagem ampla só traz a congregação do contexto', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.meetingCheckinToken.findMany(),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.congregation_id === congA1Id)).toBe(true);
  });

  it('o outro tenant não vê nada de A', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congBId, (tx) =>
      tx.meetingCheckinToken.findMany({ where: { tenant_id: tenantAId } }),
    );

    expect(rows).toHaveLength(0);
  });

  it('escrever token na congregação alheia é negado — o WITH CHECK diz o mesmo que o USING', async () => {
    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.meetingCheckinToken.create({
          data: {
            tenant_id: tenantAId,
            congregation_id: congA2Id,
            group_meeting_id: meetingA2NoTokenId,
            token: `intruso-${ts}`,
            expires_at: new Date(Date.now() + 60_000),
            created_by: userA1Id,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('apagar o token da congregação irmã não atinge linha nenhuma', async () => {
    const { count } = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.meetingCheckinToken.deleteMany({ where: { id: tokenA2Id } }),
    );

    expect(count).toBe(0);
  });
});
