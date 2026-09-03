import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();

    // Sessão de suporte satisfaz qualquer @Roles.
    //
    // `platform_support` não está em nenhuma das ~156 listas de @Roles do
    // projeto, e isso é deliberado: a conta de suporte da plataforma não tem
    // leitura permanente dos dados das igrejas. O acesso dela é pontual, por
    // `POST /auth/impersonate`, que emite um token com o tenant e a
    // congregação do alvo e `support_session: true`.
    //
    // Sem esta exceção o token impersonado carregava apenas
    // ['platform_support'] e batia nos mesmos 403 do token original — o
    // caminho existia, era auditado, e não levava a lugar nenhum.
    //
    // `support_session` só é escrito dentro de `AuthService.impersonate`, num
    // token assinado com o JWT_SECRET; não é forjável pelo cliente. E toda
    // requisição com essa marca passa pelo `AuditInterceptor`, que grava
    // `action: 'support_access'` com `impersonated_by` — o que torna esse
    // acesso mais rastreável que o de um `tenant_admin` comum.
    //
    // O RLS continua valendo por cima: o token traz um tenant só, e o
    // interceptor de contexto o fixa. Sessão de suporte não cruza tenant.
    if (user.support_session === true) return true;

    return required.some((role) => user.roles.includes(role));
  }
}
