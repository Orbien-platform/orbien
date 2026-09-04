/**
 * RLS — Plano de plataforma
 *
 * INVARIANTE: só existe um jeito de ver mais de um tenant, e ele exige as duas
 * condições ao mesmo tempo — `platform_support` em `role_assignments` E nenhum
 * tenant no contexto. Qualquer relaxamento aqui abre o produto inteiro.
 *
 * A suíte testa nos dois sentidos, que é o que dá valor ao teste:
 *
 *   abre  — platform_support sem contexto lista os N tenants e provisiona;
 *   fecha — o mesmo usuário com tenant fixado (o token de impersonate) vê um
 *           só; e tenant_admin sem contexto não vê nada, papel não é lugar.
 *
 * Ver prisma/migrations/004_rls_platform_plane.sql e
 * prisma/migrations/005_rls_audit_platform.sql.
 */

import { prisma, prismaAdmin, runAsPlatform, runAsUser } from '../helpers/rls';

const ts = Date.now();

let tenantAId: string;
let congregationAId: string;
let tenantBId: string;

// platform_support — atribuído no tenant A, mas o papel é global por definição
let supportUserId: string;
// tenant_admin no tenant A — o contraste que mostra que o papel importa
let adminUserId: string;

beforeAll(async () => {
  for (const [code, name] of [
    ['platform_support', 'Platform Support'],
    ['tenant_admin', 'Admin Tenant'],
  ] as const) {
    await prismaAdmin.role.upsert({ where: { code }, update: {}, create: { code, name } });
  }

  const tenantA = await prismaAdmin.tenant.create({
    data: { slug: `plat-a-${ts}`, name: 'Plataforma Tenant A' },
  });
  tenantAId = tenantA.id;

  const congA = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantAId, name: 'Plat A — Sede' },
  });
  congregationAId = congA.id;

  const tenantB = await prismaAdmin.tenant.create({
    data: { slug: `plat-b-${ts}`, name: 'Plataforma Tenant B' },
  });
  tenantBId = tenantB.id;

  await prismaAdmin.congregation.create({
    data: { tenant_id: tenantBId, name: 'Plat B — Sede' },
  });

  await prismaAdmin.tenantPlan.create({
    data: { tenant_id: tenantBId, plan: 'starter', status: 'trial' },
  });
  await prismaAdmin.brandingConfig.create({
    data: { tenant_id: tenantBId, app_name: 'Plataforma Tenant B' },
  });

  const supportUser = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      email: `plat-support-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  supportUserId = supportUser.id;

  const adminUser = await prismaAdmin.userAccount.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congregationAId,
      email: `plat-admin-${ts}@rls-test.local`,
      password_hash: 'x',
    },
  });
  adminUserId = adminUser.id;

  await prismaAdmin.roleAssignment.createMany({
    data: [
      {
        tenant_id: tenantAId,
        congregation_id: congregationAId,
        user_account_id: supportUserId,
        role_code: 'platform_support',
      },
      {
        tenant_id: tenantAId,
        congregation_id: congregationAId,
        user_account_id: adminUserId,
        role_code: 'tenant_admin',
      },
    ],
  });
}, 60_000);

afterAll(async () => {
  const tenants = { tenant_id: { in: [tenantAId, tenantBId] } };
  // Antes do tenant, e explicitamente: `audit_logs.actor_user_id` é
  // `onDelete: Restrict`, então deixar o cascade do tenant resolver depende da
  // ordem interna dele para não bater na restrição.
  await prismaAdmin.auditLog.deleteMany({ where: tenants });
  await prismaAdmin.roleAssignment.deleteMany({ where: tenants });
  await prismaAdmin.waitlistSubscriber.deleteMany({
    where: { email: { startsWith: `plat-lead-${ts}` } },
  });
  await prismaAdmin.tenant.deleteMany({
    where: { slug: { contains: String(ts) } },
  });
  await prismaAdmin.$disconnect();
  await prisma.$disconnect();
}, 30_000);

// ───────────────────────────────────────────────────────────────────────────────
describe('1. Abre — platform_support sem tenant no contexto', () => {
  it('enxerga os dois tenants de teste', async () => {
    const rows = await runAsPlatform(supportUserId, (tx) =>
      tx.tenant.findMany({ where: { id: { in: [tenantAId, tenantBId] } } }),
    );

    expect(rows.map((t) => t.id).sort()).toEqual([tenantAId, tenantBId].sort());
  });

  it('lista N tenants — não só o próprio', async () => {
    const total = await runAsPlatform(supportUserId, (tx) => tx.tenant.count());
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it('alcança plano, branding e congregação de um tenant que não é o seu', async () => {
    const seen = await runAsPlatform(supportUserId, async (tx) => ({
      plan: await tx.tenantPlan.findUnique({ where: { tenant_id: tenantBId } }),
      branding: await tx.brandingConfig.findUnique({ where: { tenant_id: tenantBId } }),
      congregations: await tx.congregation.count({ where: { tenant_id: tenantBId } }),
    }));

    expect(seen.plan).not.toBeNull();
    expect(seen.branding).not.toBeNull();
    expect(seen.congregations).toBe(1);
  });

  it('escreve, e não só lê — WITH CHECK acompanha o USING', async () => {
    const slug = `plat-c-${ts}`;

    const created = await runAsPlatform(supportUserId, (tx) =>
      tx.tenant.create({ data: { slug, name: 'Plataforma Tenant C' } }),
    );

    expect(created.slug).toBe(slug);

    // A leitura seguinte, feita fora do contexto de plataforma, confirma que a
    // linha existe de verdade — e não que o INSERT foi aceito e sumiu.
    const persisted = await prismaAdmin.tenant.findUnique({ where: { slug } });
    expect(persisted).not.toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('2. Fecha — o mesmo usuário, com tenant fixado', () => {
  it('sessão de suporte impersonando o tenant A vê um tenant só', async () => {
    // É exatamente o token de POST /auth/impersonate: mesmo `sub`, mesmo papel,
    // tenant fixado. O `IS NULL` de app_platform_access() é o que o segura.
    const rows = await runAsUser(tenantAId, congregationAId, supportUserId, (tx) =>
      tx.tenant.findMany(),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(tenantAId);
  });

  it('não alcança o plano de outro tenant enquanto está dentro de um', async () => {
    const plan = await runAsUser(tenantAId, congregationAId, supportUserId, (tx) =>
      tx.tenantPlan.findUnique({ where: { tenant_id: tenantBId } }),
    );

    expect(plan).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('3. Fecha — outro papel, mesmo sem tenant no contexto', () => {
  it('tenant_admin sem contexto não vê tenant nenhum', async () => {
    const rows = await runAsPlatform(adminUserId, (tx) => tx.tenant.findMany());

    // Sem tenant fixado o ramo estrito compara com NULL e nega; o ramo de
    // plataforma exige platform_support, que este usuário não tem. Zero é o
    // resultado certo — e é por isso que tirar o tenant do contexto sozinho
    // não é um caminho de escalada.
    expect(rows).toHaveLength(0);
  });

  it('tenant_admin sem contexto não consegue criar tenant', async () => {
    await expect(
      runAsPlatform(adminUserId, (tx) =>
        tx.tenant.create({ data: { slug: `plat-x-${ts}`, name: 'Não deveria existir' } }),
      ),
    ).rejects.toThrow();

    const leaked = await prismaAdmin.tenant.findUnique({ where: { slug: `plat-x-${ts}` } });
    expect(leaked).toBeNull();
  });

  it('tenant_admin dentro do próprio tenant continua vendo só o próprio', async () => {
    const rows = await runAsUser(tenantAId, congregationAId, adminUserId, (tx) =>
      tx.tenant.findMany(),
    );

    expect(rows.map((t) => t.id)).toEqual([tenantAId]);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('4. waitlist_subscribers — tabela de plataforma, sem tenant', () => {
  it('platform_support sem contexto lê a waitlist', async () => {
    await prismaAdmin.waitlistSubscriber.create({
      data: {
        email: `plat-lead-${ts}@rls-test.local`,
        pastor_name: 'Lead de teste',
        size_range: 'ate_150',
        lgpd_consent: true,
      },
    });

    const found = await runAsPlatform(supportUserId, (tx) =>
      tx.waitlistSubscriber.findFirst({ where: { email: `plat-lead-${ts}@rls-test.local` } }),
    );

    expect(found).not.toBeNull();
  });

  it('tenant_admin não lê a waitlist em contexto nenhum', async () => {
    const semContexto = await runAsPlatform(adminUserId, (tx) => tx.waitlistSubscriber.count());
    const comTenant = await runAsUser(tenantAId, congregationAId, adminUserId, (tx) =>
      tx.waitlistSubscriber.count(),
    );

    expect(semContexto).toBe(0);
    expect(comTenant).toBe(0);
  });

  it('o cadastro público (orbien_app, sem contexto) continua inserindo', async () => {
    // Sem SET ROLE e sem app.user_id — é o caminho do site, que não passa pelo
    // TenantContextInterceptor. Se as policies public_signup/public_signup_returning
    // sumirem, este teste quebra antes que o formulário do site quebre.
    const created = await prisma.waitlistSubscriber.create({
      data: {
        email: `plat-lead-${ts}-publico@rls-test.local`,
        pastor_name: 'Cadastro público',
        size_range: 'ate_150',
        lgpd_consent: true,
      },
    });

    expect(created.id).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('5. audit_logs — o ramo de plataforma é estreito', () => {
  // As seis policies de 004 abrem a tabela inteira para o plano de plataforma.
  // `audit_logs` não: cada linha carrega `before`/`after` com o dado da igreja
  // no momento da mudança. O ramo de 005 se limita ao que a própria plataforma
  // gerou — o suporte vê o que o suporte fez, e nada além.
  let idSuporteA: string;
  let idPlataformaB: string;
  let idComumA: string;

  beforeAll(async () => {
    const [suporteA, plataformaB, comumA] = await Promise.all([
      prismaAdmin.auditLog.create({
        data: {
          tenant_id: tenantAId,
          congregation_id: congregationAId,
          actor_user_id: supportUserId,
          entity: 'persons',
          action: 'support_access',
        },
      }),
      prismaAdmin.auditLog.create({
        data: {
          tenant_id: tenantBId,
          actor_user_id: supportUserId,
          entity: 'platform',
          action: 'platform_access',
        },
      }),
      prismaAdmin.auditLog.create({
        data: {
          tenant_id: tenantAId,
          congregation_id: congregationAId,
          actor_user_id: adminUserId,
          entity: 'persons',
          action: 'person.update',
        },
      }),
    ]);
    idSuporteA = suporteA.id;
    idPlataformaB = plataformaB.id;
    idComumA = comumA.id;
  }, 30_000);

  it('abre: platform_support sem contexto lê as duas ações da plataforma, nos dois tenants', async () => {
    const ids = await runAsPlatform(supportUserId, async (tx) =>
      (
        await tx.auditLog.findMany({
          where: { id: { in: [idSuporteA, idPlataformaB, idComumA] } },
          select: { id: true },
        })
      ).map((r) => r.id),
    );

    expect(ids).toContain(idSuporteA);
    expect(ids).toContain(idPlataformaB);
  });

  it('fecha: a mesma consulta não devolve ação comum de igreja', async () => {
    // É o ponto inteiro de 005 ser mais estreito que 004. Se este teste
    // passar a falhar, o histórico de alterações de todas as igrejas ficou
    // legível para o suporte sem sessão e sem rastro.
    const ids = await runAsPlatform(supportUserId, async (tx) =>
      (
        await tx.auditLog.findMany({
          where: { id: { in: [idSuporteA, idComumA] } },
          select: { id: true },
        })
      ).map((r) => r.id),
    );

    expect(ids).not.toContain(idComumA);
  });

  it('fecha: com tenant fixado, o ramo de plataforma some — o token de impersonate não lê tenant alheio', async () => {
    const ids = await runAsUser(tenantAId, congregationAId, supportUserId, async (tx) =>
      (
        await tx.auditLog.findMany({
          where: { id: { in: [idSuporteA, idPlataformaB] } },
          select: { id: true },
        })
      ).map((r) => r.id),
    );

    expect(ids).toContain(idSuporteA);
    expect(ids).not.toContain(idPlataformaB);
  });

  it('a igreja continua lendo o próprio log inteiro, ação comum incluída', async () => {
    const ids = await runAsUser(tenantAId, congregationAId, adminUserId, async (tx) =>
      (
        await tx.auditLog.findMany({
          where: { id: { in: [idSuporteA, idComumA, idPlataformaB] } },
          select: { id: true },
        })
      ).map((r) => r.id),
    );

    expect(ids).toContain(idComumA);
    expect(ids).toContain(idSuporteA);
    expect(ids).not.toContain(idPlataformaB);
  });
});
