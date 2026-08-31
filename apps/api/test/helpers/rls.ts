import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Admin client — connects as postgres (BYPASSRLS=true, DIRECT_URL).
 * Used exclusively for test fixture setup/teardown (beforeAll/afterAll).
 * Never used for isolation assertions — that would bypass the RLS policies
 * under test.
 */
export const prismaAdmin = new PrismaClient({
  datasources: {
    db: { url: process.env['DIRECT_URL']! },
  },
  log: [],
});

/**
 * App client — connects as orbien_app (NOBYPASSRLS, DATABASE_URL).
 * This mirrors exactly how the production app connects.
 * Used in runAsTenant / runAsTenantWithRole for all isolation assertions.
 *
 * With FORCE ROW LEVEL SECURITY on tables and orbien_app having NOBYPASSRLS,
 * SET LOCAL app.tenant_id is actually enforced by the RLS policies.
 */
export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env['DATABASE_URL']! },
  },
  log: [],
});

/**
 * Mimics TenantContextInterceptor: opens a transaction and applies
 * SET LOCAL for tenant context vars — no role switch.
 *
 * Since orbien_app has NOBYPASSRLS, the RLS policies ARE evaluated.
 * A test failure here means data leaks in production today.
 */
export async function runAsTenant<T>(
  tenantId: string,
  congregationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`
        SELECT
          set_config('app.tenant_id',              ${tenantId},       true),
          set_config('app.congregation_id',         ${congregationId}, true),
          set_config('app.current_tenant_id',       ${tenantId},       true),
          set_config('app.current_congregation_id', ${congregationId}, true)
      `;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * Same as runAsTenant but explicitly switches to app_user role before
 * setting context. Tests RLS enforcement via policies defined FOR app_user.
 *
 * Requires orbien_app to have app_user granted WITH SET TRUE.
 */
export async function runAsTenantWithRole<T>(
  tenantId: string,
  congregationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE app_user`;
      await tx.$executeRaw`
        SELECT
          set_config('app.tenant_id',              ${tenantId},       true),
          set_config('app.congregation_id',         ${congregationId}, true),
          set_config('app.current_tenant_id',       ${tenantId},       true),
          set_config('app.current_congregation_id', ${congregationId}, true)
      `;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
