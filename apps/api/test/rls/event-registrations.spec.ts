/**
 * RLS — inscrições em evento (PROD-16)
 *
 * `event_registrations` é tabela NOVA, e o que este arquivo mede é que ela
 * nasceu com a policy certa: escopo de CONGREGAÇÃO
 * (`015_rls_event_registrations.sql`), não de tenant. Sem o script, a tabela
 * ficaria sem RLS e `app_user` — que tem GRANT em tudo em `public` por
 * ALTER DEFAULT PRIVILEGES — leria a lista de inscritos de todas as igrejas.
 *
 * Duas congregações do MESMO tenant, de propósito: o caso que só o isolamento
 * por tenant deixaria passar é justamente esse, e é o que a pendência nº 1
 * documentou para as outras tabelas. Uma terceira congregação de outro tenant
 * cobre o eixo de fora.
 *
 * `runAsTenantWithRole` e não `runAsTenant`: a policy é `TO app_user`, e é
 * essa a forma como a produção roda (o `TenantContextInterceptor` faz
 * `SET LOCAL ROLE app_user` antes do `set_config`).
 */

import { prismaAdmin, runAsTenantWithRole } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congA1Id: string;
let congA2Id: string;
let tenantBId: string;
let congBId: string;

let userA1Id: string;
let postA1Id: string;
let postA2Id: string;
let registrationA1Id: string;
let registrationA2Id: string;

async function createPost(tenantId: string, congregationId: string, userId: string) {
  const post = await prismaAdmin.contentPost.create({
    data: {
      tenant_id: tenantId,
      congregation_id: congregationId,
      created_by_user_id: userId,
      type: 'event',
      title: `Retiro ${ts}`,
      registration_enabled: true,
    },
  });
  return post.id;
}

beforeAll(async () => {
  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `evt-a-${ts}`, name: 'Tenant A (eventos)' },
  });
  tenantAId = tenantA.id;
  congA1Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Sede' } })
  ).id;
  congA2Id = (
    await prismaAdmin.congregation.create({ data: { tenant_id: tenantAId, name: 'A — Filial' } })
  ).id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `evt-b-${ts}`, name: 'Tenant B (eventos)' },
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
        email: `evt-a1-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    })
  ).id;
  const userBId = (
    await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantBId,
        congregation_id: congBId,
        email: `evt-b-${ts}@rls-test.local`,
        password_hash: 'x',
      },
    })
  ).id;

  postA1Id = await createPost(tenantAId, congA1Id, userA1Id);
  postA2Id = await createPost(tenantAId, congA2Id, userA1Id);
  const postBId = await createPost(tenantBId, congBId, userBId);

  registrationA1Id = (
    await prismaAdmin.eventRegistration.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA1Id,
        content_post_id: postA1Id,
        full_name: 'Inscrito da Sede',
      },
    })
  ).id;
  registrationA2Id = (
    await prismaAdmin.eventRegistration.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congA2Id,
        content_post_id: postA2Id,
        full_name: 'Inscrito da Filial',
      },
    })
  ).id;
  await prismaAdmin.eventRegistration.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congBId,
      content_post_id: postBId,
      full_name: 'Inscrito de Outro Tenant',
    },
  });
}, 60_000);

afterAll(async () => {
  await prismaAdmin.eventRegistration.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.contentPost.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.userAccount.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
}, 30_000);

describe('event_registrations — isolamento (PROD-16)', () => {
  it('a congregação vê a própria inscrição (controle positivo)', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.eventRegistration.findUnique({ where: { id: registrationA1Id } }),
    );

    expect(row?.full_name).toBe('Inscrito da Sede');
  });

  it('a congregação IRMÃ, do mesmo tenant, não vê — é o caso que só tenant_id deixaria passar', async () => {
    const row = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.eventRegistration.findUnique({ where: { id: registrationA2Id } }),
    );

    expect(row).toBeNull();
  });

  it('listagem ampla só traz a congregação do contexto', async () => {
    const rows = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.eventRegistration.findMany(),
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.congregation_id === congA1Id)).toBe(true);
  });

  it('o outro tenant não vê nada de A', async () => {
    const rows = await runAsTenantWithRole(tenantBId, congBId, (tx) =>
      tx.eventRegistration.findMany({ where: { tenant_id: tenantAId } }),
    );

    expect(rows).toHaveLength(0);
  });

  it('escrever inscrição na congregação alheia é negado — o WITH CHECK diz o mesmo que o USING', async () => {
    await expect(
      runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
        tx.eventRegistration.create({
          data: {
            tenant_id: tenantAId,
            congregation_id: congA2Id,
            content_post_id: postA2Id,
            full_name: 'Intruso',
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('apagar a inscrição da congregação irmã não atinge linha nenhuma', async () => {
    const { count } = await runAsTenantWithRole(tenantAId, congA1Id, (tx) =>
      tx.eventRegistration.deleteMany({ where: { id: registrationA2Id } }),
    );

    expect(count).toBe(0);
  });
});
