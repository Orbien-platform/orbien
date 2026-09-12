import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PLAN_KEY = 'requires_plan';

/**
 * Marca uma rota (ou controller inteiro) como exclusiva do plano Premium,
 * seguindo a matriz de `docs/produto/pricing-church-platform.md` seção 5.
 * Quem nega é o `PlanGuard`, lido pelo mesmo mecanismo de metadata que
 * `@Roles`/`RolesGuard` já usa — os dois guards são independentes e
 * compostos: uma rota pode exigir papel e plano ao mesmo tempo.
 */
export const RequiresPlan = (plan: 'premium') => SetMetadata(REQUIRES_PLAN_KEY, plan);
