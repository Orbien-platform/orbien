import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PLATFORM_ROUTE_KEY } from '../decorators/platform-route.decorator';

declare module 'express' {
  interface Request {
    tenant_id?: string;
    congregation_id?: string;
    currentUser?: JwtPayload;
  }
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as JwtPayload | undefined;

    if (!user) return next.handle();

    const isPlatformRoute =
      this.reflector.getAllAndOverride<boolean | undefined>(PLATFORM_ROUTE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;

    // Rota de plataforma não fixa tenant nem congregação: é a ausência deles
    // que habilita o ramo `app_platform_access()` das policies. Fixar string
    // vazia teria o mesmo efeito que fixar NULL para `app_current_tenant()`,
    // mas o request não deve carregar um tenant que o token não tem.
    if (!isPlatformRoute) {
      req.tenant_id = user.tenant_id;
      req.congregation_id = user.congregation_id;
    }
    req.currentUser = user;

    const tenantId = isPlatformRoute ? '' : user.tenant_id;
    const congregationId = isPlatformRoute ? '' : user.congregation_id;

    // $transaction opens a single DB connection for the entire request.
    // SET LOCAL (set_config true) is scoped to that transaction — vars reset at commit,
    // preventing leakage across connections in PgBouncer transaction mode.
    // We use tx.$executeRaw here (not this.prisma.setTenantContext) because setTenantContext
    // uses the main client, which would open a separate implicit transaction and reset
    // the SET LOCAL vars before next.handle() ever runs.
    return from(
      this.prisma.$transaction(
        async (tx) => {
          // A conexão é `orbien_app`, que tem policies `orbien_app_auth ...
          // USING (true)` em tenants, congregations, branding_configs,
          // tenant_plans, user_accounts, role_assignments e audit_logs — elas
          // existem porque login e bootstrap público rodam antes de haver
          // qualquer contexto. Policies PERMISSIVE se combinam com OR, então
          // enquanto a requisição autenticada também rodava como `orbien_app`
          // o RLS dessas tabelas não valia nada em produção: o `SET LOCAL
          // app.tenant_id` era avaliado, mas o `OR true` ganhava sempre.
          //
          // Trocar de role resolve pela raiz. Policy só se aplica ao role
          // corrente (e aos que ele herda); como `app_user` NÃO é membro de
          // `orbien_app`, as policies de auth deixam de ser alcançáveis daqui.
          // O caminho pré-autenticação continua como `orbien_app` e segue
          // funcionando — ele nem passa por este interceptor, porque não tem
          // `req.user`.
          //
          // Requer `GRANT app_user TO orbien_app WITH SET TRUE` (passo 5 do
          // scripts/bootstrap-db.sh). Sem o `WITH SET TRUE` esta linha falha
          // com 42501 em toda requisição autenticada — alto e imediato, que é
          // o modo de falha certo para isto.
          await tx.$executeRawUnsafe('SET LOCAL ROLE app_user');

          await tx.$executeRaw`
            SELECT
              set_config('app.tenant_id',        ${tenantId},                    true),
              set_config('app.congregation_id',   ${congregationId},              true),
              set_config('app.user_id',           ${user.sub},                    true),
              set_config('app.role_codes',        ${user.roles.join(',')},        true)
          `;

          return this.prisma.withTx(tx, () => firstValueFrom(next.handle()));
        },
        { timeout: 30_000, maxWait: 10_000 },
      ),
    );
  }
}
