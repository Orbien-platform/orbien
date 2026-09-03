import {
  Injectable,
  Logger,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/**
 * Registra em `audit_logs` toda requisição feita em sessão de suporte.
 *
 * É o contrapeso da exceção do `RolesGuard`: uma sessão de suporte satisfaz
 * qualquer `@Roles`, e o que torna isso aceitável é o rastro. Se este
 * interceptor não rodar, a exceção fica sem contrapartida.
 *
 * Duas coisas que estavam erradas aqui e ficaram valendo até 2026-09-03:
 *
 * 1. O interceptor não estava registrado em lugar nenhum — nem global, nem em
 *    controller. Nunca rodou. Agora é `APP_INTERCEPTOR` no `AppModule`.
 * 2. A escrita usava `prisma.auditLog.create()`, ou seja um INSERT como
 *    `orbien_app`. A tabela `audit_logs` só tem policy de SELECT para esse
 *    role — a escrita é reservada à função `audit_insert()`, que é
 *    SECURITY DEFINER (ver 001_rls_setup.sql, grupo 8). O INSERT era negado
 *    pelo RLS, e o `.catch(() => void 0)` engolia o erro em silêncio.
 *
 * Por isso a escrita agora vai por `audit_insert()` e a falha é logada. Segue
 * sendo best-effort de propósito: auditoria que derruba a requisição
 * transformaria um problema de observabilidade em indisponibilidade.
 *
 * Usa o client principal, não o da transação do `TenantContextInterceptor`: o
 * registro precisa sobreviver a um handler que role back.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const user = req.user as JwtPayload | undefined;

    if (!user?.support_session) return next.handle();

    const route = req.path;
    const method = req.method;
    const ip = req.ip ?? null;
    const userAgent = req.get('user-agent') ?? null;

    return next.handle().pipe(
      tap(() => {
        const after = JSON.stringify({ route, method, status: res.statusCode });

        this.prisma
          .$executeRaw`
            SELECT audit_insert(
              ${user.tenant_id}::text,
              ${user.congregation_id}::text,
              -- impersonated_by é o usuário platform_support que abriu a sessão
              ${user.impersonated_by ?? user.sub}::text,
              NULL::text,
              ${route}::text,
              'support_access'::text,
              NULL::jsonb,
              ${after}::jsonb,
              ${ip}::text,
              ${userAgent}::text
            )
          `.catch((err: unknown) => {
          this.logger.error(
            `falha ao registrar support_access em ${method} ${route}: ${String(err)}`,
          );
        });
      }),
    );
  }
}
