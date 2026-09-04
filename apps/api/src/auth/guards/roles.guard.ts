import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

// Sessão de suporte só lê. Fase 5 revisita a decisão da Fase 1 ("libera também
// rota de escrita") e fecha essa porta: o suporte da plataforma abre um tenant
// inteiro por `POST /auth/impersonate`, e nada nesse fluxo hoje precisa
// escrever no tenant do cliente — só ver o que ele vê para diagnosticar. GET e
// HEAD não têm efeito colateral; qualquer outro verbo é escrita, e cai na
// checagem normal de papel — que nega, porque `platform_support` não está em
// nenhuma lista de `@Roles` de dado de igreja, de propósito.
const SAFE_METHODS = new Set(['GET', 'HEAD']);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtPayload; params: Record<string, string>; method: string }>();
    const { user } = request;

    // Ticket de upload não carrega papel: quem autorizou foi a rota que o
    // emitiu, que exigiu WRITE_ROLES antes de assinar. O que ele carrega é o
    // recurso, e é só para ele que vale — um ticket do post A não sobe arquivo
    // no post B. Vem antes do ramo de suporte de propósito: ticket emitido
    // dentro de uma sessão de suporte continua preso ao seu alvo.
    if (user.scope === 'upload') {
      return (
        user.upload_target !== undefined && user.upload_target === request.params['id']
      );
    }

    // Sessão de suporte satisfaz qualquer @Roles, mas só em leitura.
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
    //
    // Mas só em GET/HEAD: fora deles a resposta é `false` direto, sem olhar
    // `required` — o mesmo efeito do 403 que a linha de baixo produziria para
    // `roles: ['platform_support']`, que não está em nenhuma dessas listas,
    // só que sem depender de a lista continuar vazia disso.
    if (user.support_session === true) return SAFE_METHODS.has(request.method);

    return required.some((role) => user.roles.includes(role));
  }
}
