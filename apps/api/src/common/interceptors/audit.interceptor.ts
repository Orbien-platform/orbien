import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const user = req.user as JwtPayload | undefined;

    if (!user?.support_session) return next.handle();

    const route = req.path;
    const method = req.method;

    return next.handle().pipe(
      tap(() => {
        const after: Prisma.InputJsonValue = { route, method, status: res.statusCode };

        this.prisma.auditLog
          .create({
            data: {
              tenant_id: user.tenant_id,
              congregation_id: user.congregation_id,
              // impersonated_by is the platform_support user who opened the session
              actor_user_id: user.impersonated_by ?? user.sub,
              entity: route,
              action: 'support_access',
              after,
            },
          })
          .catch(() => void 0);
      }),
    );
  }
}
