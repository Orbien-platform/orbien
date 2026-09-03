import {
  Injectable,
  Logger,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PLATFORM_ROUTE_KEY } from '../decorators/platform-route.decorator';

/**
 * Registra em `audit_logs` duas coisas: toda requisição feita em sessão de
 * suporte, e toda requisição a uma rota de plataforma.
 *
 * É o contrapeso das duas exceções que o produto abre para o suporte da
 * plataforma, e elas são diferentes:
 *
 *   `support_access`  — a exceção do `RolesGuard`: uma sessão de suporte
 *                       satisfaz qualquer `@Roles`, dentro de um tenant.
 *   `platform_access` — a exceção do RLS: `@PlatformRoute()` tira o tenant do
 *                       contexto e o ramo `app_platform_access()` abre os N
 *                       tenants. Nenhuma sessão de suporte está envolvida —
 *                       é o login normal de um `platform_support`.
 *
 * A segunda foi adicionada na Fase 2 porque sem ela `POST /platform/tenants`
 * criava uma igreja inteira sem deixar rastro. Se este interceptor não rodar,
 * as duas exceções ficam sem contrapartida.
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const user = req.user as JwtPayload | undefined;

    if (!user) return next.handle();

    // A sessão de suporte vence: se as duas marcas estiverem presentes, o que
    // interessa registrar é que havia impersonação no meio.
    const action = user.support_session
      ? 'support_access'
      : this.reflector.getAllAndOverride<boolean | undefined>(PLATFORM_ROUTE_KEY, [
            context.getHandler(),
            context.getClass(),
          ]) === true
        ? 'platform_access'
        : null;

    if (!action) return next.handle();

    const route = req.path;
    const method = req.method;
    const ip = req.ip ?? null;
    const userAgent = req.get('user-agent') ?? null;

    return next.handle().pipe(
      tap((body: unknown) => {
        const after = JSON.stringify({
          route,
          method,
          status: res.statusCode,
          // Numa rota de plataforma o tenant da coluna é o do ator, não o da
          // ação — o token do suporte não carrega tenant algum. Sem isto,
          // "criou uma igreja" e "listou a waitlist" ficam indistinguíveis no
          // log. Lê um campo só, e só quando a resposta é um objeto.
          ...(action === 'platform_access' ? { subject_tenant_id: tenantOf(body) } : {}),
        });

        this.prisma
          .$executeRaw`
            SELECT audit_insert(
              ${user.tenant_id}::text,
              ${user.congregation_id}::text,
              -- impersonated_by é o usuário platform_support que abriu a sessão
              ${user.impersonated_by ?? user.sub}::text,
              NULL::text,
              ${route}::text,
              ${action}::text,
              NULL::jsonb,
              ${after}::jsonb,
              ${ip}::text,
              ${userAgent}::text
            )
          `.catch((err: unknown) => {
          this.logger.error(
            `falha ao registrar ${action} em ${method} ${route}: ${String(err)}`,
          );
        });
      }),
    );
  }
}

/**
 * Extrai o `tenant_id` da resposta, quando ela é um objeto que tem um. É o
 * caso de `POST /platform/tenants`; nas demais rotas de plataforma dá `null`,
 * e tudo bem — o rastro continua sendo rota, método e status.
 */
function tenantOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)['tenant_id'];
  return typeof value === 'string' ? value : null;
}
