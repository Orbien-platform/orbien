import { PrismaClient } from '@prisma/client';

/**
 * Os dois tenants que existem para teste (`docs/AMBIENTES.md`, DEC-06):
 * `teste1-church` (Starter) e `teste2-church` (Premium). São criados por
 * `prisma/seed.ts` — faltou dado neles, o que falta é seed, não permissão para
 * usar outro tenant. `doca-church` (cliente zero) NUNCA entra aqui.
 */
export const TEST_TENANT_SLUGS = ['teste1-church', 'teste2-church'] as const;
export type TestTenantSlug = (typeof TEST_TENANT_SLUGS)[number];

export type TestTenant = {
  slug: TestTenantSlug;
  tenantId: string;
  congregationId: string;
  pixKey: string;
  plan: 'starter' | 'premium';
  /** Categoria de receita "Oferta" da congregação, a mesma que a rota pública resolve. */
  ofertaCategoryId: string;
};

export async function loadTestTenant(
  admin: PrismaClient,
  slug: TestTenantSlug,
): Promise<TestTenant> {
  const tenant = await admin.tenant.findUnique({
    where: { slug },
    select: { id: true, tenantPlan: { select: { plan: true } }, brandingConfig: { select: { pix_key: true } } },
  });
  if (!tenant) {
    throw new Error(`Tenant de teste "${slug}" não existe — rode "npm run db:seed -w orbien-backend".`);
  }

  const congregation = await admin.congregation.findFirstOrThrow({
    where: { tenant_id: tenant.id },
    orderBy: { created_at: 'asc' },
    select: { id: true },
  });
  const oferta = await admin.financialCategory.findFirstOrThrow({
    where: { tenant_id: tenant.id, congregation_id: congregation.id, name: 'Oferta', type: 'income' },
    select: { id: true },
  });

  return {
    slug,
    tenantId: tenant.id,
    congregationId: congregation.id,
    pixKey: tenant.brandingConfig?.pix_key ?? '',
    plan: tenant.tenantPlan?.plan === 'premium' ? 'premium' : 'starter',
    ofertaCategoryId: oferta.id,
  };
}
