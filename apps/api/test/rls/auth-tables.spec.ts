/**
 * RLS — o que `orbien_app` alcança nas tabelas de auth (PEND-04, ações A e B)
 *
 * Todo o resto de `test/rls/` mede policies `FOR app_user`: o estado depois do
 * `SET LOCAL ROLE` que o `TenantContextInterceptor` faz. Este arquivo mede o
 * caminho ANTES dele, que nenhum outro cobre — `orbien_app` cru, sem troca de
 * role e sem contexto de tenant. É como rodam, em produção:
 *
 *   - `AuthService.login()` / `platformLogin()` / `refresh()` / `logout()` /
 *     `impersonate()`, que usam o client base (`this.prisma.userAccount`,
 *     não `this.prisma.client`);
 *   - `JwtStrategy.validate()`, que roda no ciclo de Guard — antes de
 *     qualquer Interceptor, portanto fora da transação do contexto;
 *   - as rotas públicas, onde o interceptor sai cedo por não haver `req.user`.
 *
 * Por isso as asserções usam o client `prisma` do helper DIRETO, fora de
 * `runAsTenant*`: é exatamente a conexão `orbien_app` da produção, sem nada
 * em volta. Usar qualquer helper aqui mediria outra coisa.
 *
 * O que cada bloco protege está no cabeçalho dele. O resumo é que 017 fecha
 * duas coisas e deliberadamente deixa uma terceira aberta, e as três precisam
 * continuar como estão — inclusive a que ficou aberta.
 */

import { randomUUID } from 'crypto';
import { prisma, prismaAdmin, ensureRole } from '../helpers/rls';

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
});

afterAll(async () => {
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
  await prisma.$disconnect();
});

/**
 * O que 017 NÃO fecha, e tem que continuar funcionando. Se algum destes
 * quebrar, o login caiu em produção — é o modo de falha caro, e é por isso
 * que estes vêm primeiro.
 */
describe('leitura sem contexto — o que o login depende', () => {
  it('acha a conta pelo e-mail, com papéis, tenant e plano juntos', async () => {
    // Espelha `AuthService.login()` (auth.service.ts:110): a mesma consulta,
    // com a mesma forma. É o caso que a policy `orbien_app_auth` existe para
    // servir, e o que a ação D (fechar por linha) teria de preservar.
    const user = await prisma.userAccount.findUnique({
      where: { email: `a-${ts}@authtbl.test` },
      include: {
        roleAssignments: { select: { role_code: true, congregation_id: true } },
        tenant: { include: { tenantPlan: { select: { plan: true } } } },
      },
    });

    expect(user?.id).toBe(userAId);
    expect(user?.roleAssignments.map((ra) => ra.role_code)).toEqual(['tenant_admin']);
    expect(user?.tenant.id).toBe(tenantAId);
  });

  it('relê is_active da conta e do tenant, como o JwtStrategy faz', async () => {
    // jwt.strategy.ts:22 — roda em TODA requisição autenticada, não só no
    // login, porque Guards vêm antes de Interceptors no ciclo do Nest.
    const user = await prisma.userAccount.findUnique({
      where: { id: userAId },
      select: { is_active: true, tenant: { select: { is_active: true } } },
    });

    expect(user?.is_active).toBe(true);
    expect(user?.tenant.is_active).toBe(true);
  });

  it('escreve e revoga refresh_token — 017 não aperta esta tabela', async () => {
    // O contrapeso explícito do aperto: em `refresh_tokens` a escrita por
    // `orbien_app` sem contexto é o caminho vivo (auth.service.ts:254, 283,
    // 293, 327, 478). Estender o `FOR SELECT` a ela derrubaria login, refresh
    // e logout de uma vez — este teste é o que faz isso falhar no CI, e não
    // em produção.
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
 * O que 017 fecha. Nenhum destes tinha chamador quando o mapeamento foi
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
      await prismaAdmin.auditLog.count({ where: { entity: 'auth-tables-spec' } }),
    ).toBe(1);

    // `orbien_app` sem contexto, não. Sobra só a policy `tenant_read`
    // (001 + 005), que exige tenant no contexto ou `app_platform_access()`.
    expect(await prisma.auditLog.count({ where: { entity: 'auth-tables-spec' } })).toBe(0);
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
