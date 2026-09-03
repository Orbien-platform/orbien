import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ROUTE_KEY = 'platform_route';

/**
 * Marca uma rota (ou controller) como sendo do plano de plataforma: sem tenant
 * no contexto.
 *
 * O `TenantContextInterceptor` fixa `app.tenant_id` a partir do JWT em toda
 * requisição. Rota de plataforma não tem tenant no token — e `app.tenant_id`
 * vazio faz `app_current_tenant()` devolver NULL, o que por si só já negaria
 * tudo. Este decorator diz ao interceptor para não fixar tenant nem
 * congregação, deixando o ramo `app_platform_access()` das policies responder.
 *
 * Só abre alguma coisa em conjunto com o papel: o predicado do banco exige
 * `platform_support` em `role_assignments`. Marcar uma rota com este decorator
 * sem `@Roles('platform_support')` no guard não dá acesso a nada — devolve
 * lista vazia, que é o modo de falha seguro.
 *
 * Ver prisma/migrations/004_rls_platform_plane.sql.
 */
export const PlatformRoute = () => SetMetadata(PLATFORM_ROUTE_KEY, true);
