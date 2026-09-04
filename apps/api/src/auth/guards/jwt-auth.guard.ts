import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UPLOAD_TICKET_KEY } from '../decorators/upload-ticket.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/** Métodos que não alteram estado. Tudo fora daqui é escrita. */
const LEITURA = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Autentica pelo Bearer e aplica os dois limites que dependem do *formato* do
 * token, não do papel de quem o carrega.
 *
 * Ficam aqui, e não no `RolesGuard`, por um motivo estrutural: `RolesGuard`
 * libera cedo toda rota sem `@Roles`, então qualquer regra posta nele deixa de
 * valer justamente nas rotas menos protegidas. Este guard está em todo
 * controller protegido do projeto, e é onde uma regra passa a valer para todas
 * as rotas de uma vez.
 *
 * **1. Sessão de suporte não escreve.** O `AuditInterceptor` é controle
 * detectivo: diz depois quem fez, não impede. E a sessão de suporte satisfaz
 * qualquer `@Roles` — o operador tem, dentro do tenant, mais poder que a
 * maioria dos usuários daquela igreja. Enquanto não existir fluxo de suporte
 * que precise escrever, o corte é aqui, na API, e não na UI: UI que esconde o
 * botão não impede a requisição.
 *
 * **2. Ticket de upload só vale na rota de upload.** O ticket é entregue ao
 * JavaScript da página — é o preço de o arquivo ir direto para a API, fora do
 * proxy do Next, que na Vercel tem teto de 4,5 MB de corpo. Como ele fica
 * legível, precisa não servir para mais nada.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const autenticado = (await super.canActivate(context)) as boolean;
    if (!autenticado) return false;

    const request = context
      .switchToHttp()
      .getRequest<{ user: JwtPayload; method: string }>();
    const { user } = request;

    if (user?.support_session === true && !LEITURA.has(request.method)) {
      throw new ForbiddenException(
        'Sessão de suporte é somente leitura. Peça a alteração a um responsável da igreja.',
      );
    }

    if (user?.scope !== 'upload') return true;

    const rotaDeUpload = this.reflector.getAllAndOverride<boolean | undefined>(
      UPLOAD_TICKET_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rotaDeUpload) {
      throw new UnauthorizedException('Ticket de upload não vale nesta rota.');
    }

    return true;
  }
}
