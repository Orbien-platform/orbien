/**
 * RLS — o que `orbien_app` alcança em tenants, congregations, branding_configs
 * e tenant_plans (PEND-04, ação C)
 *
 * Mesmo desenho de `auth-tables.spec.ts`: as asserções usam o client `prisma`
 * do helper DIRETO — a conexão `orbien_app` da produção, sem `SET LOCAL ROLE`
 * e sem contexto de tenant. É como rodam as rotas públicas (doação, células,
 * QR de visitante, domínio próprio) e o `impersonate`.
 *
 * Estado que este arquivo prende:
 *   - Sem contexto, `orbien_app` lê 0 linhas das quatro tabelas.
 *   - Cada função de 034 responde por UM parâmetro exato e devolve só as
 *     colunas devidas (nada de `cloudflare_*`).
 *   - Com `app.tenant_id` fixado, `orbien_app` enxerga só o PRÓPRIO tenant
 *     (herança de `app_user`): é o que o callback OAuth e as células públicas
 *     usam depois de resolver o tenant.
 */

import type { Prisma } from '@prisma/client';
import { prisma, prismaAdmin, runAsTenant, runAsTenantWithRole } from '../helpers/rls';
import { TENANT_MAIL_BRAND_SELECT } from '../../src/mail/mail-brand';

const ts = Date.now();

let tenantAId: string;
let tenantBId: string;
let congA1Id: string; // mais antiga
let congA2Id: string;
let congBId: string;
let qrTokenA: string;
let qrTokenB: string;

const slugA = `pub-a-${ts}`;
const slugB = `pub-b-${ts}`;
const hostA = `igreja-a-${ts}.example.test`;
const hostB = `igreja-b-${ts}.example.test`;

beforeAll(async () => {
  const a = await prismaAdmin.tenant.create({ data: { slug: slugA, name: 'Tenant A (public)' } });
  const b = await prismaAdmin.tenant.create({ data: { slug: slugB, name: 'Tenant B (public)' } });
  tenantAId = a.id;
  tenantBId = b.id;

  const c1 = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantAId, name: 'A — Sede', created_at: new Date('2020-01-01') },
  });
  const c2 = await prismaAdmin.congregation.create({
    data: { tenant_id: tenantAId, name: 'A — Filial', created_at: new Date('2021-01-01') },
  });
  const cb = await prismaAdmin.congregation.create({ data: { tenant_id: tenantBId, name: 'B — Sede' } });
  congA1Id = c1.id;
  congA2Id = c2.id;
  congBId = cb.id;

  await prismaAdmin.brandingConfig.create({
    data: {
      tenant_id: tenantAId,
      app_name: 'Igreja A',
      pix_key: 'pix-a@example.test',
      primary_color: '#112233',
      secondary_color: '#445566',
      logo_url: 'https://cdn.example.test/a.png',
      custom_domain: hostA,
      custom_domain_status: 'verified',
      cloudflare_access_token_encrypted: 'SEGREDO-CF-A',
      cloudflare_refresh_token_encrypted: 'SEGREDO-CF-REFRESH-A',
    },
  });
  await prismaAdmin.brandingConfig.create({
    data: {
      tenant_id: tenantBId,
      pix_key: 'pix-b@example.test',
      custom_domain: hostB,
      custom_domain_status: 'pending',
      cloudflare_access_token_encrypted: 'SEGREDO-CF-B',
    },
  });
  await prismaAdmin.tenantPlan.create({
    data: { tenant_id: tenantAId, plan: 'premium', status: 'active' },
  });

  const qa = await prismaAdmin.qrToken.create({
    data: {
      tenant_id: tenantAId,
      congregation_id: congA2Id,
      origin: 'service',
      created_by: 'seed',
    },
  });
  const qb = await prismaAdmin.qrToken.create({
    data: {
      tenant_id: tenantBId,
      congregation_id: congBId,
      origin: 'service',
      created_by: 'seed',
    },
  });
  qrTokenA = qa.token;
  qrTokenB = qb.token;
});

afterAll(async () => {
  await prismaAdmin.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  await prismaAdmin.$disconnect();
  await prisma.$disconnect();
});

describe('leitura direta sem contexto — fechada (PEND-04 C)', () => {
  it('as quatro tabelas existem para o dono mas orbien_app lê 0 linhas', async () => {
    const ids = { in: [tenantAId, tenantBId] };
    expect(await prismaAdmin.tenant.count({ where: { id: ids } })).toBe(2);
    expect(await prismaAdmin.congregation.count({ where: { tenant_id: ids } })).toBe(3);
    expect(await prismaAdmin.brandingConfig.count({ where: { tenant_id: ids } })).toBe(2);
    expect(await prismaAdmin.tenantPlan.count({ where: { tenant_id: ids } })).toBe(1);

    expect(await prisma.tenant.findMany({ where: { id: ids } })).toEqual([]);
    expect(await prisma.congregation.findMany({ where: { tenant_id: ids } })).toEqual([]);
    expect(await prisma.brandingConfig.findMany({ where: { tenant_id: ids } })).toEqual([]);
    expect(await prisma.tenantPlan.findMany({ where: { tenant_id: ids } })).toEqual([]);
  });

  it('o slug, que era a consulta das rotas públicas, não acha mais o tenant', async () => {
    expect(await prisma.tenant.findUnique({ where: { slug: slugA } })).toBeNull();
  });

  it('o token OAuth da Cloudflare não é alcançável sem contexto', async () => {
    const rows = await prisma.$queryRaw<unknown[]>`
      SELECT cloudflare_access_token_encrypted FROM branding_configs
       WHERE cloudflare_access_token_encrypted IS NOT NULL
         AND tenant_id IN (${tenantAId}, ${tenantBId})
    `;
    expect(rows).toEqual([]);
  });

  it('não escreve nas quatro tabelas sem contexto', async () => {
    await expect(
      prisma.tenant.create({ data: { slug: `intruso-${ts}`, name: 'Intruso' } }),
    ).rejects.toThrow(/row-level security|42501/i);
    expect(await prisma.brandingConfig.updateMany({ where: { tenant_id: tenantAId }, data: { app_name: 'hack' } })).toEqual({ count: 0 });
    expect(await prisma.tenantPlan.updateMany({ where: { tenant_id: tenantAId }, data: { plan: 'starter' } })).toEqual({ count: 0 });
    expect(await prisma.congregation.updateMany({ where: { tenant_id: tenantAId }, data: { name: 'hack' } })).toEqual({ count: 0 });
    const admin = await prismaAdmin.brandingConfig.findUnique({ where: { tenant_id: tenantAId } });
    expect(admin?.app_name).toBe('Igreja A');
  });
});

describe('com app.tenant_id fixado, orbien_app vê só o próprio tenant', () => {
  it('lê e escreve a marca do tenant do contexto, nunca a do outro', async () => {
    await runAsTenant(tenantAId, congA1Id, async (tx) => {
      const own = await tx.brandingConfig.findUnique({ where: { tenant_id: tenantAId } });
      expect(own?.app_name).toBe('Igreja A');
      expect(await tx.brandingConfig.findUnique({ where: { tenant_id: tenantBId } })).toBeNull();
      expect(await tx.tenant.findUnique({ where: { id: tenantBId } })).toBeNull();
      expect(await tx.tenantPlan.findUnique({ where: { tenant_id: tenantBId } })).toBeNull();

      // O que o callback OAuth faz.
      const upd = await tx.brandingConfig.update({
        where: { tenant_id: tenantAId },
        data: { cloudflare_zone_id: `zona-${ts}` },
      });
      expect(upd.cloudflare_zone_id).toBe(`zona-${ts}`);
    });
  });

  it('a leitura do recibo do webhook (tenant + marca + plano) segue funcionando sob o escopo', async () => {
    // `DonationReceiptService.generateForTransaction` roda depois do commit do
    // webhook, como `orbien_app`, com o escopo vindo do banco. O `.catch` do
    // chamador engole erro: se isto voltar vazio, o recibo some em silêncio.
    await runAsTenant(tenantAId, congA1Id, async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantAId },
        select: TENANT_MAIL_BRAND_SELECT,
      });
      expect(tenant).not.toBeNull();
      const plan = await tx.tenantPlan.findUnique({
        where: { tenant_id: tenantAId },
        select: { plan: true },
      });
      expect(plan?.plan).toBe('premium');
    });
  });

  it('o contexto de A não escreve na marca de B', async () => {
    const r = await runAsTenant(tenantAId, congA1Id, (tx) =>
      tx.brandingConfig.updateMany({ where: { tenant_id: tenantBId }, data: { app_name: 'hack' } }),
    );
    expect(r.count).toBe(0);
  });
});

interface TenantRow { tenant_id: string; name: string; is_active: boolean; app_name: string | null }
interface DonationRow {
  tenant_id: string; tenant_name: string; app_name: string | null; pix_key: string | null;
  congregation_id: string | null; plan: string | null; plan_status: string | null;
}

describe('public_tenant_by_slug (034)', () => {
  it('devolve só id, nome, ativo e nome de exibição — pelo slug exato', async () => {
    const rows = await prisma.$queryRaw<TenantRow[]>`SELECT * FROM public_tenant_by_slug(${slugA})`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      tenant_id: tenantAId,
      name: 'Tenant A (public)',
      is_active: true,
      app_name: 'Igreja A',
    });
    expect(Object.keys(rows[0]).sort()).toEqual(['app_name', 'is_active', 'name', 'tenant_id']);
  });

  it('tenant sem branding volta com app_name nulo; o de B nunca vaza o de A', async () => {
    const b = await prisma.$queryRaw<TenantRow[]>`SELECT * FROM public_tenant_by_slug(${slugB})`;
    expect(b.map((r) => r.tenant_id)).toEqual([tenantBId]);
    expect(b[0].app_name).toBeNull();
  });

  it.each([
    ['inexistente', 'nao-existe-slug'],
    ['vazio', ''],
    ['curinga %', '%'],
    ['prefixo', 'pub-a-'],
    ['injeção', `' OR '1'='1`],
  ])('slug %s não devolve linha (sem enumeração)', async (_n, slug) => {
    expect(await prisma.$queryRaw<TenantRow[]>`SELECT * FROM public_tenant_by_slug(${slug})`).toEqual([]);
  });

  it('NULL não devolve linha', async () => {
    expect(await prisma.$queryRaw<TenantRow[]>`SELECT * FROM public_tenant_by_slug(NULL::text)`).toEqual([]);
  });
});

describe('public_donation_target (034)', () => {
  it('devolve a chave PIX, a congregação MAIS ANTIGA e o plano do slug pedido', async () => {
    const rows = await prisma.$queryRaw<DonationRow[]>`SELECT * FROM public_donation_target(${slugA})`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      tenant_id: tenantAId,
      tenant_name: 'Tenant A (public)',
      app_name: 'Igreja A',
      pix_key: 'pix-a@example.test',
      congregation_id: congA1Id,
      plan: 'premium',
      plan_status: 'active',
    });
  });

  it('não devolve nenhuma coluna de token da Cloudflare nem domínio', async () => {
    const rows = await prisma.$queryRaw<DonationRow[]>`SELECT * FROM public_donation_target(${slugA})`;
    expect(Object.keys(rows[0]).sort()).toEqual(
      ['app_name', 'congregation_id', 'pix_key', 'plan', 'plan_status', 'tenant_id', 'tenant_name'].sort(),
    );
    expect(JSON.stringify(rows)).not.toMatch(/SEGREDO/);
  });

  it('tenant sem plano volta com plan nulo (starter por omissão no service)', async () => {
    const rows = await prisma.$queryRaw<DonationRow[]>`SELECT * FROM public_donation_target(${slugB})`;
    expect(rows[0]).toMatchObject({ tenant_id: tenantBId, plan: null, plan_status: null, congregation_id: congBId });
  });

  it.each([['inexistente', 'nope'], ['curinga', '%'], ['vazio', '']])(
    'slug %s não devolve linha',
    async (_n, slug) => {
      expect(await prisma.$queryRaw<DonationRow[]>`SELECT * FROM public_donation_target(${slug})`).toEqual([]);
    },
  );
});

describe('public_qr_church (034)', () => {
  it('devolve o nome da congregação do token e a marca — só do tenant dele', async () => {
    const a = await prisma.$queryRaw<Array<Record<string, string | null>>>`SELECT * FROM public_qr_church(${qrTokenA})`;
    expect(a).toEqual([
      {
        church_name: 'A — Filial',
        primary_color: '#112233',
        secondary_color: '#445566',
        logo_url: 'https://cdn.example.test/a.png',
        logo_url_dark: null,
      },
    ]);
    const b = await prisma.$queryRaw<Array<Record<string, string | null>>>`SELECT * FROM public_qr_church(${qrTokenB})`;
    expect(b[0].church_name).toBe('B — Sede');
    expect(b[0].primary_color).toBeNull();
  });

  it.each([['inexistente', 'token-que-nao-existe'], ['curinga', '%'], ['vazio', '']])(
    'token %s não devolve linha',
    async (_n, token) => {
      expect(await prisma.$queryRaw<unknown[]>`SELECT * FROM public_qr_church(${token})`).toEqual([]);
    },
  );
});

describe('public_domain_resolve (034)', () => {
  it('resolve o slug só quando o domínio está verificado', async () => {
    const a = await prisma.$queryRaw<Array<{ slug: string | null }>>`SELECT public_domain_resolve(${hostA}) AS slug`;
    expect(a[0].slug).toBe(slugA);
    // B tem o domínio cadastrado, mas `pending`.
    const b = await prisma.$queryRaw<Array<{ slug: string | null }>>`SELECT public_domain_resolve(${hostB}) AS slug`;
    expect(b[0].slug).toBeNull();
  });

  it.each([['desconhecido', 'outro.example.test'], ['curinga', '%'], ['vazio', ''], ['prefixo', 'igreja-a-']])(
    'host %s não resolve',
    async (_n, host) => {
      const r = await prisma.$queryRaw<Array<{ slug: string | null }>>`SELECT public_domain_resolve(${host}) AS slug`;
      expect(r[0].slug).toBeNull();
    },
  );
});

describe('auth_impersonate_target (034)', () => {
  it('devolve plano e a primeira congregação do tenant pedido', async () => {
    const a = await prisma.$queryRaw<Array<Record<string, string | null>>>`SELECT * FROM auth_impersonate_target(${tenantAId})`;
    expect(a).toEqual([{ tenant_id: tenantAId, plan: 'premium', congregation_id: congA1Id }]);
    const b = await prisma.$queryRaw<Array<Record<string, string | null>>>`SELECT * FROM auth_impersonate_target(${tenantBId})`;
    expect(b).toEqual([{ tenant_id: tenantBId, plan: null, congregation_id: congBId }]);
  });

  it('id desconhecido, vazio ou NULL não devolve linha', async () => {
    for (const id of ['nao-existe', '']) {
      expect(await prisma.$queryRaw<unknown[]>`SELECT * FROM auth_impersonate_target(${id})`).toEqual([]);
    }
    expect(await prisma.$queryRaw<unknown[]>`SELECT * FROM auth_impersonate_target(NULL::text)`).toEqual([]);
  });
});

describe('quem pode chamar', () => {
  it('app_user (requisição autenticada) não executa nenhuma das cinco', async () => {
    const queries: Array<(tx: Prisma.TransactionClient) => Promise<unknown>> = [
      (tx) => tx.$queryRaw`SELECT * FROM public_tenant_by_slug('x')`,
      (tx) => tx.$queryRaw`SELECT * FROM public_donation_target('x')`,
      (tx) => tx.$queryRaw`SELECT * FROM public_qr_church('x')`,
      (tx) => tx.$queryRaw`SELECT public_domain_resolve('x')`,
      (tx) => tx.$queryRaw`SELECT * FROM auth_impersonate_target('x')`,
    ];
    for (const q of queries) {
      await expect(runAsTenantWithRole(tenantAId, congA1Id, q)).rejects.toThrow(/permission denied|42501/i);
    }
  });

  it('as cinco são SECURITY DEFINER com search_path fixo e dono diferente de orbien_app', async () => {
    const rows = await prismaAdmin.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n
        FROM pg_proc p
        JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
       WHERE p.proname IN ('public_tenant_by_slug','public_donation_target','public_qr_church',
                           'public_domain_resolve','auth_impersonate_target')
         AND p.prosecdef
         AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
         AND has_function_privilege('orbien_app', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('app_user', p.oid, 'EXECUTE')
         AND NOT has_function_privilege('public', p.oid, 'EXECUTE')
         AND pg_get_userbyid(p.proowner) <> 'orbien_app'
    `;
    expect(Number(rows[0].n)).toBe(5);
  });
});
