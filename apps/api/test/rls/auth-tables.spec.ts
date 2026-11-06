/**
 * RLS — o que `orbien_app` alcança nas tabelas de auth (PEND-04, ações A, B e D)
 *
 * Todo o resto de `test/rls/` mede policies `FOR app_user`: o estado depois do
 * `SET LOCAL ROLE` que o `TenantContextInterceptor` faz. Este arquivo mede o
 * caminho ANTES dele, que nenhum outro cobre — `orbien_app` cru, sem troca de
 * role e sem contexto de tenant. É como rodam, em produção, `AuthService`
 * (login, refresh, impersonate), `JwtStrategy.validate()` (Guard, antes de
 * qualquer Interceptor), o webhook público do Pix e as rotas públicas.
 *
 * Por isso as asserções usam o client `prisma` do helper DIRETO, fora de
 * `runAsTenant*`: é exatamente a conexão `orbien_app` da produção.
 *
 * Estado que este arquivo prende:
 *   - `user_accounts` e `role_assignments`: `orbien_app` NÃO lê nem escreve por
 *     tabela. A única leitura é pelas funções SECURITY DEFINER de 033, por
 *     e-mail ou id exato.
 *   - `refresh_tokens`: escrita viva por `orbien_app` (login/refresh/logout) NA
 *     RELEASE 1; o código já escreve em contexto (`withRefreshContext`) e lê por
 *     `auth_refresh_lookup` (036). A policy cai na release 2.
 *   - `audit_logs`: fora da policy; a escrita é por `audit_insert()`.
 */

import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma, prismaAdmin, ensureRole, runAsTenantWithRole, runAsUser } from '../helpers/rls';
import { withRefreshContext } from '../../src/auth/auth-lookup';

const ts = Date.now();

let tenantAId: string;
let congregationAId: string;
let userAId: string;
let tenantBId: string;
let congregationBId: string;
let userBId: string;

beforeAll(async () => {
  await ensureRole(prismaAdmin, 'tenant_admin', 'Administrador da igreja');

  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `authtbl-a-${ts}`, name: 'Tenant A (auth tables)' },
  });
  tenantAId = tenantA.id;
  const congA = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantAId, name: 'A — Sede' },
  });
  congregationAId = congA.id;
  const userA = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      email: `a-${ts}@authtbl.test`,
      password_hash: 'hash-a',
    },
  });
  userAId = userA.id;
  await prismaAdmin.roleAssignment.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      user_account_id: userAId,
      role_code: 'tenant_admin',
    },
  });

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `authtbl-b-${ts}`, name: 'Tenant B (auth tables)' },
  });
  tenantBId = tenantB.id;
  const congB = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantBId, name: 'B — Sede' },
  });
  congregationBId = congB.id;
  const userB = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      email: `b-${ts}@authtbl.test`,
      password_hash: 'hash-b',
    },
  });
  userBId = userB.id;
  await prismaAdmin.roleAssignment.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congregationBId,
      user_account_id: userBId,
      role_code: 'tenant_admin',
    },
  });
});

afterAll(async () => {
  // Ordem explícita, não cascata. `AuditLog.actorUser` é `onDelete: Restrict`
  // e `AuditLog.tenant` é `onDelete: Cascade`: apagar só o tenant faz o
  // Postgres cascatear para `user_accounts` E `audit_logs` ao mesmo tempo, e
  // se a conta sair primeiro o `Restrict` dispara — teardown quebrado, e as
  // fixtures da rodada anterior fazem a contagem de `audit_logs` do último
  // teste falhar na rodada seguinte. Mesmo motivo e mesma ordem de
  // `tenant-audit-read.spec.ts:99`.
  await prismaAdmin.auditLog.deleteMany({
    where: { tenant_id: { in: [tenantAId, tenantBId] } },
  });
  await prismaAdmin.userAccount.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
  await prisma.$disconnect();
});

interface LoginRow {
  user_id: string;
  tenant_id: string;
  congregation_id: string;
  password_hash: string;
  is_active: boolean;
  tenant_is_active: boolean;
  plan: string | null;
  roles: Array<{ role_code: string; congregation_id: string }>;
}

describe('leitura direta por tabela — fechada (PEND-04 D)', () => {
  it('orbien_app não lista user_accounts: duas contas existem, zero linhas voltam', async () => {
    // Antes da ação D este `findMany` devolvia as contas de TODOS os tenants,
    // com `password_hash`.
    expect(
      await prismaAdmin.userAccount.count({ where: { id: { in: [userAId, userBId] } } }),
    ).toBe(2);
    expect(await prisma.userAccount.findMany({ where: { id: { in: [userAId, userBId] } } })).toEqual([]);
  });

  it('orbien_app não acha conta pelo e-mail, que era a consulta do login', async () => {
    expect(await prisma.userAccount.findUnique({ where: { email: `a-${ts}@authtbl.test` } })).toBeNull();
  });

  it('orbien_app não lê role_assignments', async () => {
    expect(
      await prismaAdmin.roleAssignment.count({ where: { user_account_id: { in: [userAId, userBId] } } }),
    ).toBe(2);
    expect(await prisma.roleAssignment.findMany({ where: { user_account_id: { in: [userAId, userBId] } } })).toEqual([]);
  });

  it('a relação também não vaza: refresh_tokens com include userAccount devolve a conta nula/ausente', async () => {
    const created = await prisma.refreshToken.create({
      data: {
        user_account_id: userAId,
        token_hash: `hash-${randomUUID()}`,
        expires_at: new Date(Date.now() + 60_000),
      },
    });
    // A FK é verificada pelo dono (RI), então a escrita passa; a LEITURA da
    // conta por relação não.
    const rows = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n
        FROM refresh_tokens rt JOIN user_accounts ua ON ua.id = rt.user_account_id
       WHERE rt.id = ${created.id}
    `;
    expect(Number(rows[0].n)).toBe(0);
  });
});

describe('funções de leitura do login — o único caminho (033)', () => {
  it('auth_login_lookup(e-mail) devolve só aquela conta, com hash, papéis, tenant e plano', async () => {
    const rows = await prisma.$queryRaw<LoginRow[]>`
      SELECT * FROM auth_login_lookup(${`a-${ts}@authtbl.test`})
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: userAId,
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      password_hash: 'hash-a',
      is_active: true,
      tenant_is_active: true,
    });
    expect(rows[0].roles.map((r) => r.role_code)).toEqual(['tenant_admin']);
  });

  it('o e-mail do tenant B devolve só B — nunca as linhas de A', async () => {
    const rows = await prisma.$queryRaw<LoginRow[]>`
      SELECT * FROM auth_login_lookup(${`b-${ts}@authtbl.test`})
    `;
    expect(rows.map((r) => r.user_id)).toEqual([userBId]);
    expect(rows[0].tenant_id).toBe(tenantBId);
  });

  it.each([
    ['inexistente', 'ninguem@authtbl.test'],
    ['vazio', ''],
    ['curinga %', '%'],
    ['curinga LIKE', `%@authtbl.test`],
    ['prefixo', `a-${Date.now()}`],
    ['injeção', `' OR '1'='1`],
  ])('auth_login_lookup com e-mail %s não devolve linha (sem enumeração)', async (_nome, email) => {
    const rows = await prisma.$queryRaw<LoginRow[]>`SELECT * FROM auth_login_lookup(${email})`;
    expect(rows).toEqual([]);
  });

  it('auth_login_lookup(NULL) não devolve linha', async () => {
    const rows = await prisma.$queryRaw<LoginRow[]>`SELECT * FROM auth_login_lookup(NULL::text)`;
    expect(rows).toEqual([]);
  });

  it('auth_session_lookup(id) devolve a sessão SEM a coluna de hash', async () => {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM auth_session_lookup(${userAId})
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: userAId, is_active: true, tenant_is_active: true });
    expect(Object.keys(rows[0])).not.toContain('password_hash');
  });

  it('auth_session_lookup reflete conta inativa e tenant inativo', async () => {
    await prismaAdmin.userAccount.update({ where: { id: userBId }, data: { is_active: false } });
    await prismaAdmin.tenant.update({ where: { id: tenantAId }, data: { is_active: false } });
    try {
      const [b] = await prisma.$queryRaw<Array<{ is_active: boolean }>>`
        SELECT * FROM auth_session_lookup(${userBId})`;
      const [a] = await prisma.$queryRaw<Array<{ tenant_is_active: boolean }>>`
        SELECT * FROM auth_session_lookup(${userAId})`;
      expect(b.is_active).toBe(false);
      expect(a.tenant_is_active).toBe(false);
    } finally {
      await prismaAdmin.userAccount.update({ where: { id: userBId }, data: { is_active: true } });
      await prismaAdmin.tenant.update({ where: { id: tenantAId }, data: { is_active: true } });
    }
  });

  it('auth_session_lookup com id desconhecido, vazio ou NULL não devolve linha', async () => {
    for (const id of [randomUUID(), '', '%']) {
      expect(await prisma.$queryRaw`SELECT * FROM auth_session_lookup(${id})`).toEqual([]);
    }
    expect(await prisma.$queryRaw`SELECT * FROM auth_session_lookup(NULL::text)`).toEqual([]);
  });

  it('auth_tenant_admin_user_id devolve o admin do tenant pedido, nunca o de outro', async () => {
    const [a] = await prisma.$queryRaw<Array<{ id: string | null }>>`
      SELECT auth_tenant_admin_user_id(${tenantAId}) AS id`;
    const [b] = await prisma.$queryRaw<Array<{ id: string | null }>>`
      SELECT auth_tenant_admin_user_id(${tenantBId}) AS id`;
    const [nenhum] = await prisma.$queryRaw<Array<{ id: string | null }>>`
      SELECT auth_tenant_admin_user_id(${randomUUID()}) AS id`;
    expect(a.id).toBe(userAId);
    expect(b.id).toBe(userBId);
    expect(nenhum.id).toBeNull();
  });

  it('app_user não executa as funções (requisição autenticada lê pelo RLS normal)', async () => {
    for (const q of [
      (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT * FROM auth_login_lookup('x@y.z')`,
      (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT * FROM auth_session_lookup('x')`,
      (tx: Prisma.TransactionClient) => tx.$queryRaw`SELECT auth_tenant_admin_user_id('x')`,
    ]) {
      await expect(runAsTenantWithRole(tenantAId, congregationAId, q)).rejects.toThrow(/permission denied|42501/i);
    }
  });

  it('escreve e revoga refresh_token — esta tabela segue aberta a orbien_app', async () => {
    // O contrapeso explícito: em `refresh_tokens` a escrita por `orbien_app` sem
    // contexto é o caminho vivo (login, refresh, logout). Este teste faz falhar
    // no CI, e não em produção, qualquer aperto que a alcance.
    const created = await prisma.refreshToken.create({
      data: {
        user_account_id: userAId,
        token_hash: `hash-${randomUUID()}`,
        expires_at: new Date(Date.now() + 60_000),
      },
    });

    const revoked = await prisma.refreshToken.updateMany({
      where: { id: created.id },
      data: { revoked_at: new Date() },
    });

    expect(revoked.count).toBe(1);
  });
});

/**
 * Escrita sem contexto, fechada em 017 (ação B). Nenhum destes tinha chamador quando o mapeamento foi
 * feito — o que muda é que agora a ausência de chamador está no banco, não só
 * no grep.
 */
describe('escrita sem contexto — fechada por 017', () => {
  it('não insere conta em user_accounts', async () => {
    // INSERT é o caso que ERRA: sem policy PERMISSIVE que o autorize, o
    // Postgres levanta 42501. UPDATE e DELETE são o caso silencioso, coberto
    // pelo teste seguinte.
    await expect(
      prisma.userAccount.create({
        data: {
          tenant_id: tenantAId,
          congregation_id: congregationAId,
          email: `intruso-${ts}@authtbl.test`,
          password_hash: 'hash-intruso',
        },
      }),
    ).rejects.toThrow();
  });

  it('não altera conta de tenant nenhum, nem a do próprio contexto ausente', async () => {
    // Com `FOR SELECT` a policy vira filtro de leitura e some do UPDATE: a
    // linha deixa de ser alcançável para escrita e o comando afeta 0 linhas,
    // sem erro. Antes de 017 este `updateMany` desativaria as duas contas.
    const desativadas = await prisma.userAccount.updateMany({
      where: { id: { in: [userAId, userBId] } },
      data: { is_active: false },
    });
    expect(desativadas.count).toBe(0);

    // E as contas seguem ativas de fato — lido pelo admin, fora do RLS.
    const ativas = await prismaAdmin.userAccount.count({
      where: { id: { in: [userAId, userBId] }, is_active: true },
    });
    expect(ativas).toBe(2);
  });

  it('não concede papel em role_assignments', async () => {
    // O caminho mais direto de escalar privilégio pelas tabelas de auth:
    // inserir `platform_support` para si mesmo. Não havia chamador, mas a
    // permissão existia.
    await expect(
      prisma.roleAssignment.create({
        data: {
          tenant_id: tenantBId,
          congregation_id: congregationBId,
          user_account_id: userBId,
          role_code: 'tenant_admin',
        },
      }),
    ).rejects.toThrow();
  });
});

/**
 * `audit_logs` saiu inteira da policy — é a única das oito sem consumidor.
 */
describe('audit_logs — fora da policy orbien_app_auth', () => {
  it('não lê linha alguma sem contexto', async () => {
    await prismaAdmin.$executeRaw`
      SELECT audit_insert(
        ${tenantAId}::text, ${congregationAId}::text, ${userAId}::text,
        NULL::text, 'auth-tables-spec'::text, 'support_access'::text,
        NULL::jsonb, NULL::jsonb, NULL::text, NULL::text, NULL::text
      )
    `;

    // A linha existe — o admin a enxerga.
    expect(
      await prismaAdmin.auditLog.count({
        where: { entity: 'auth-tables-spec', tenant_id: tenantAId },
      }),
    ).toBe(1);

    // `orbien_app` sem contexto, não. Sobra só a policy `tenant_read`
    // (001 + 005), que exige tenant no contexto ou `app_platform_access()`.
    expect(
      await prisma.auditLog.count({
        where: { entity: 'auth-tables-spec', tenant_id: tenantAId },
      }),
    ).toBe(0);
  });

  it('não escreve direto, e é por isso que audit_insert() é SECURITY DEFINER', async () => {
    // O INSERT acima passou porque `audit_insert()` roda como o dono. Pelo
    // client base, direto na tabela, não passa — e trocar a função por um
    // `prisma.auditLog.create()` faria a auditoria sumir em silêncio, porque
    // o AuditInterceptor grava best-effort, com `.catch()` que só loga.
    await expect(
      prisma.auditLog.create({
        data: {
          tenant_id: tenantAId,
          congregation_id: congregationAId,
          actor_user_id: userAId,
          entity: 'auth-tables-spec-direto',
          action: 'support_access',
        },
      }),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// refresh_tokens — leitura por hash e escrita em contexto (PEND-04, release 1)
// ---------------------------------------------------------------------------
describe('refresh_tokens — auth_refresh_lookup e withRefreshContext (036)', () => {
  let userPlatId: string;
  const hashA = `rt-hash-a-${ts}`;
  const hashB = `rt-hash-b-${ts}`;
  const exp = new Date(Date.now() + 3600_000);

  beforeAll(async () => {
    await ensureRole(prismaAdmin, 'platform_support', 'Platform Support');
    const plat = await prismaAdmin.userAccount.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congregationAId,
        email: `plat-${ts}@authtbl.test`,
        password_hash: 'hash-p',
      },
    });
    userPlatId = plat.id;
    await prismaAdmin.roleAssignment.create({
      data: {
        tenant_id: tenantAId,
        congregation_id: congregationAId,
        user_account_id: userPlatId,
        role_code: 'platform_support',
      },
    });
    await prismaAdmin.refreshToken.createMany({
      data: [
        { user_account_id: userAId, token_hash: hashA, expires_at: exp },
        { user_account_id: userBId, token_hash: hashB, expires_at: exp },
      ],
    });
  });

  afterAll(async () => {
    await prismaAdmin.refreshToken.deleteMany({
      where: { user_account_id: { in: [userAId, userBId, userPlatId] } },
    });
    await prismaAdmin.roleAssignment.deleteMany({ where: { user_account_id: userPlatId } });
    await prismaAdmin.userAccount.deleteMany({ where: { id: userPlatId } });
  });

  it('a função devolve uma linha por hash exato, e sem o hash', async () => {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT * FROM auth_refresh_lookup(${hashA})`;
    expect(rows).toHaveLength(1);
    expect(rows[0]['user_account_id']).toBe(userAId);
    expect(Object.keys(rows[0]).sort()).toEqual(['expires_at', 'id', 'revoked_at', 'user_account_id']);
  });

  it('hash desconhecido e padrão não casam: zero linhas', async () => {
    expect(await prisma.$queryRaw`SELECT * FROM auth_refresh_lookup(${'rt-hash-%'})`).toEqual([]);
    expect(await prisma.$queryRaw`SELECT * FROM auth_refresh_lookup(${'nao-existe'})`).toEqual([]);
  });

  it('app_user (requisição autenticada) não executa a função', async () => {
    await expect(
      runAsUser(
        tenantAId,
        congregationAId,
        userAId,
        (tx) => tx.$queryRaw`SELECT * FROM auth_refresh_lookup(${hashA})`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  const comContexto = <T>(userId: string, tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    withRefreshContext(prisma, { userId, tenantId }, fn);

  it('no contexto de A: vê só os tokens de A; B é invisível, não atualizável e não gravável', async () => {
    const vistos = await comContexto(userAId, tenantAId, (tx) =>
      tx.refreshToken.findMany({ where: { token_hash: { in: [hashA, hashB] } } }),
    );
    expect(vistos.map((r) => r.token_hash)).toEqual([hashA]);

    const upd = await comContexto(userAId, tenantAId, (tx) =>
      tx.refreshToken.updateMany({ where: { token_hash: hashB }, data: { revoked_at: new Date() } }),
    );
    expect(upd.count).toBe(0);

    await expect(
      comContexto(userAId, tenantAId, (tx) =>
        tx.refreshToken.create({
          data: { user_account_id: userBId, token_hash: `rt-forja-${ts}`, expires_at: exp },
        }),
      ),
    ).rejects.toThrow();
    expect(await prismaAdmin.refreshToken.findFirst({ where: { token_hash: hashB } })).toMatchObject({
      revoked_at: null,
    });
  });

  it('conta de plataforma COM o tenant fixado não abre os tokens dos outros tenants', async () => {
    const vistos = await comContexto(userPlatId, tenantAId, (tx) =>
      tx.refreshToken.findMany({ where: { token_hash: { in: [hashA, hashB] } } }),
    );
    expect(vistos).toEqual([]);
  });
});
