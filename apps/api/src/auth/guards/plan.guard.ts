import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PLAN_KEY } from '../decorators/requires-plan.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Nega por plano, não por papel — eixo independente do `RolesGuard`. Uma
 * rota sem `@RequiresPlan` libera para qualquer plano; a autoridade sobre
 * "esse plano existe e é esse mesmo" continua sendo o RLS/Postgres, isto
 * aqui é só o portão de produto descrito em
 * `docs/produto/pricing-church-platform.md` seção 5.
 *
 * `user.plan` vem do token, escrito em `AuthService` a partir de
 * `TenantPlan.plan` a cada login/refresh/impersonação — inclusive na
 * impersonação, que carrega o plano do tenant **alvo**, não o do suporte.
 * Por isso este guard **não** abre exceção para `support_session`: o ponto
 * da sessão de suporte é ver o que o tenant vê, não mais que isso. Onde o
 * suporte precisa enxergar acima de planos é rota de plataforma
 * (`@PlatformRoute()`), que não passa por aqui.
 */
@Injectable()
export class PlanGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<'premium' | undefined>(REQUIRES_PLAN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    if (user.plan === required) return true;

    throw new ForbiddenException('Recurso disponível apenas no plano Premium');
  }
}
