import {
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UPLOAD_TICKET_KEY } from '../decorators/upload-ticket.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Autentica pelo Bearer e contém o ticket de upload.
 *
 * A contenção mora aqui, e não no `RolesGuard`, porque `RolesGuard` libera
 * cedo toda rota sem `@Roles` — um ticket vazado alcançaria essas. Este guard
 * está em todo controller protegido, então é o ponto onde a regra vale para
 * todas as rotas de uma vez.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const autenticado = (await super.canActivate(context)) as boolean;
    if (!autenticado) return false;

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();
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
