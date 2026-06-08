import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Shared PrismaClient for RLS tests.
 *
 * Uses DIRECT_URL (bypasses PgBouncer) so that interactive transactions
 * and SET LOCAL settings work reliably. Falls back to DATABASE_URL.
 *
 * This client connects as the postgres superuser — which BYPASSES RLS by
 * default unless the table has FORCE ROW LEVEL SECURITY. The role switch
 * to app_user is intentionally NOT done here, mirroring what
 * TenantContextInterceptor does in production. Any test failure reveals a
 * real security gap: either the app_user role is never activated, or the
 * helper functions reference the wrong config key (app.current_tenant_id
 * vs app.tenant_id).
 */
export const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL']! },
  },
  log: [],
});

/**
 * Runs `fn` inside a Prisma interactive transaction that first applies
 * SET LOCAL for tenant_id and congregation_id — exactly as
 * TenantContextInterceptor does in production.
 *
 * @param tenantId       - The tenant to impersonate
 * @param congregationId - The congregation to impersonate
 * @param fn             - Receives the transaction client; all queries
 *                         inside MUST use this client to stay within the
 *                         SET LOCAL scope.
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
          set_config('app.tenant_id',        ${tenantId},        true),
          set_config('app.congregation_id',   ${congregationId},  true),
          set_config('app.current_tenant_id', ${tenantId},        true),
          set_config('app.current_congregation_id', ${congregationId}, true)
      `;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

/**
 * Same as runAsTenant but also switches the PostgreSQL role to app_user
 * so that RLS policies (which are FOR app_user) are actually evaluated.
 *
 * This is the CORRECT way to test RLS enforcement. If runAsTenant (without
 * role switch) passes isolation tests but runAsTenantWithRole does not,
 * the gap is that the app never switches to app_user — RLS is bypassed.
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
          set_config('app.tenant_id',        ${tenantId},        true),
          set_config('app.congregation_id',   ${congregationId},  true),
          set_config('app.current_tenant_id', ${tenantId},        true),
          set_config('app.current_congregation_id', ${congregationId}, true)
      `;
      return fn(tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
