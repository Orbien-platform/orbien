import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Leituras públicas (sem JWT, sem contexto de tenant) de `tenants`,
 * `congregations`, `branding_configs` e `tenant_plans` (PEND-04, ação C).
 *
 * `orbien_app` não tem policy de leitura nessas quatro tabelas: o único
 * caminho sem `app.tenant_id` são as funções `SECURITY DEFINER` de
 * `034_rls_public_lookup.sql`. Este arquivo é o ÚNICO lugar com esse SQL — quem
 * precisar de tenant/marca/plano antes de haver contexto chama daqui, em vez de
 * `prisma.tenant.find*` no client base.
 *
 * Cada função responde por UM parâmetro exato (slug, token, host, id) e devolve
 * no máximo uma linha, só com as colunas que o consumidor usa.
 */

type Client = PrismaClient | Prisma.TransactionClient;

export interface PublicTenantRow {
  tenant_id: string;
  name: string;
  is_active: boolean;
  app_name: string | null;
}

export interface PublicDonationTargetRow {
  tenant_id: string;
  tenant_name: string;
  app_name: string | null;
  pix_key: string | null;
  congregation_id: string | null;
  plan: string | null;
  plan_status: string | null;
}

export interface PublicQrChurchRow {
  church_name: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url: string | null;
  logo_url_dark: string | null;
}

export interface ImpersonateTargetRow {
  tenant_id: string;
  plan: string | null;
  congregation_id: string | null;
}

/** Células públicas: slug exato. */
export async function findPublicTenantBySlug(
  client: Client,
  slug: string,
): Promise<PublicTenantRow | null> {
  const rows = await client.$queryRaw<PublicTenantRow[]>`
    SELECT * FROM public_tenant_by_slug(${slug})
  `;
  return rows[0] ?? null;
}

/** Doação pública e PIX manual: slug exato. Colunas ausentes voltam `null`. */
export async function findPublicDonationTarget(
  client: Client,
  slug: string,
): Promise<PublicDonationTargetRow | null> {
  const rows = await client.$queryRaw<PublicDonationTargetRow[]>`
    SELECT * FROM public_donation_target(${slug})
  `;
  return rows[0] ?? null;
}

/** Autocadastro por QR: token exato. Nome da congregação e marca da igreja. */
export async function findPublicQrChurch(
  client: Client,
  token: string,
): Promise<PublicQrChurchRow | null> {
  const rows = await client.$queryRaw<PublicQrChurchRow[]>`
    SELECT * FROM public_qr_church(${token})
  `;
  return rows[0] ?? null;
}

/** Domínio próprio: host exato. Só devolve slug se o domínio está `verified`. */
export async function findTenantSlugByVerifiedHost(
  client: Client,
  host: string,
): Promise<string | null> {
  const rows = await client.$queryRaw<Array<{ slug: string | null }>>`
    SELECT public_domain_resolve(${host}) AS slug
  `;
  return rows[0]?.slug ?? null;
}

/** `POST /auth/impersonate`: id do tenant alvo. Plano e primeira congregação. */
export async function findImpersonateTarget(
  client: Client,
  tenantId: string,
): Promise<ImpersonateTargetRow | null> {
  const rows = await client.$queryRaw<ImpersonateTargetRow[]>`
    SELECT * FROM auth_impersonate_target(${tenantId})
  `;
  return rows[0] ?? null;
}
