import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Leituras pré-autenticação de `user_accounts`/`role_assignments`
 * (PEND-04, ação D).
 *
 * `orbien_app` não tem policy de leitura nessas duas tabelas: o único caminho
 * sem contexto de tenant são as funções `SECURITY DEFINER` de
 * `033_rls_auth_lookup.sql`. Este arquivo é o ÚNICO lugar com esse SQL — quem
 * precisar da conta antes de haver contexto chama daqui, em vez de
 * `prisma.userAccount.find*` no client base (que agora devolve vazio).
 *
 * Nada aqui aceita padrão ou lista: e-mail exato, id exato. Zero ou uma linha.
 */

type Client = PrismaClient | Prisma.TransactionClient;

export interface AuthRoleRow {
  role_code: string;
  congregation_id: string;
}

export interface AuthSessionRow {
  user_id: string;
  tenant_id: string;
  congregation_id: string;
  is_active: boolean;
  tenant_is_active: boolean;
  plan: string | null;
  roles: AuthRoleRow[];
}

export interface AuthLoginRow extends AuthSessionRow {
  password_hash: string;
}

/** Login e login de plataforma: e-mail exato. Único que devolve o hash. */
export async function findLoginByEmail(
  client: Client,
  email: string,
): Promise<AuthLoginRow | null> {
  const rows = await client.$queryRaw<AuthLoginRow[]>`
    SELECT * FROM auth_login_lookup(${email})
  `;
  return rows[0] ?? null;
}

/** JwtStrategy, refresh e impersonate: id exato. Sem hash. */
export async function findSessionByUserId(
  client: Client,
  userId: string,
): Promise<AuthSessionRow | null> {
  const rows = await client.$queryRaw<AuthSessionRow[]>`
    SELECT * FROM auth_session_lookup(${userId})
  `;
  return rows[0] ?? null;
}

/**
 * Webhook Pix: o `tenantId` vem do escopo que `pix_webhook_scope()` resolve
 * pelo id da Asaas, nunca do payload.
 */
export async function findTenantAdminUserId(
  client: Client,
  tenantId: string,
): Promise<string | null> {
  const rows = await client.$queryRaw<Array<{ id: string | null }>>`
    SELECT auth_tenant_admin_user_id(${tenantId}) AS id
  `;
  return rows[0]?.id ?? null;
}

/**
 * `refresh_tokens` (PEND-04, release 1 de 2).
 *
 * O refresh entra com um HASH, não com o usuário, então a leitura sem contexto
 * é a função `auth_refresh_lookup` (036): hash exato, no máximo uma linha, sem
 * o hash na resposta. Toda ESCRITA roda em `withRefreshContext`, que vira
 * `app_user` e fixa o dono do token — a `own_tokens` amarra a escrita a ele.
 */
export interface RefreshTokenRow {
  id: string;
  user_account_id: string;
  expires_at: Date;
  revoked_at: Date | null;
}

export async function findRefreshTokenByHash(
  client: Client,
  tokenHash: string,
): Promise<RefreshTokenRow | null> {
  const rows = await client.$queryRaw<RefreshTokenRow[]>`
    SELECT * FROM auth_refresh_lookup(${tokenHash})
  `;
  return rows[0] ?? null;
}

/**
 * Transação com o contexto mínimo para `own_tokens`: `SET LOCAL ROLE app_user`
 * (o mesmo que o `TenantContextInterceptor` faz) e `app.user_id`/`app.tenant_id`
 * do dono. O tenant fica fixado de propósito: sem ele o ramo
 * `app_platform_access()` da policy abriria os tokens de todos os tenants para
 * uma conta `platform_support`.
 */
export async function withRefreshContext<T>(
  prisma: PrismaClient,
  ctx: { userId: string; tenantId: string },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');
    await tx.$executeRaw`
      SELECT
        set_config('app.tenant_id', ${ctx.tenantId}, true),
        set_config('app.user_id',   ${ctx.userId},   true)
    `;
    return fn(tx);
  });
}
