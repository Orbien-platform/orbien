import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

declare module 'express' {
  interface Request {
    tenant_id?: string;
    congregation_id?: string;
    currentUser?: JwtPayload;
  }
}

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as JwtPayload | undefined;

    if (!user) return next.handle();

    req.tenant_id = user.tenant_id;
    req.congregation_id = user.congregation_id;
    req.currentUser = user;

    // $transaction opens a single DB connection for the entire request.
    // SET LOCAL (set_config true) is scoped to that transaction — vars reset at commit,
    // preventing leakage across connections in PgBouncer transaction mode.
    // We use tx.$executeRaw here (not this.prisma.setTenantContext) because setTenantContext
    // uses the main client, which would open a separate implicit transaction and reset
    // the SET LOCAL vars before next.handle() ever runs.
    return from(
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('app.tenant_id',        ${user.tenant_id},              true),
            set_config('app.congregation_id',   ${user.congregation_id},        true),
            set_config('app.user_id',           ${user.sub},                    true),
            set_config('app.role_codes',        ${user.roles.join(',')},        true)
        `;

        return firstValueFrom(next.handle());
      }),
    );
  }
}
