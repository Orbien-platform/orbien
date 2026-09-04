import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

export interface AuditLogItem {
  id: string;
  at: Date;
  tenant_id: string;
  tenant_slug: string | null;
  tenant_name: string | null;
  congregation_id: string | null;
  actor_user_id: string;
  actor_email: string | null;
  route: string;
  method: string | null;
  status: number | null;
  ip: string | null;
  user_agent: string | null;
}

export interface AuditLogPage {
  data: AuditLogItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Fase 5 — a tela lê o que `AuditInterceptor` grava desde a Fase 1 e ninguém
 * nunca olhou: toda requisição em sessão de suporte, com `action:
 * 'support_access'`. O filtro é fixo, não um parâmetro — esta rota existe
 * para uma pergunta só, "o que o suporte fez em nome de qual igreja", e um
 * filtro de `action` livre reabriria leitura de `platform_access` por uma
 * rota que não tem `@Roles('platform_support')` pensada para isso.
 *
 * `entity` guarda a rota (`req.path`) e `after` o JSON com `route`, `method` e
 * `status` — formato do `AuditInterceptor`, não desta tela. `actorUser` e
 * `tenant` são as mesmas duas relações do model `AuditLog`; a travessia
 * funciona sob RLS porque a policy de `audit_logs` (005) e a de
 * `user_accounts` (004) já abrem para `app_platform_access()`.
 */
@Injectable()
export class ListAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsQueryDto): Promise<AuditLogPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.AuditLogWhereInput = { action: 'support_access' };

    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          at: true,
          tenant_id: true,
          congregation_id: true,
          actor_user_id: true,
          entity: true,
          after: true,
          ip: true,
          user_agent: true,
          tenant: { select: { slug: true, name: true } },
          actorUser: { select: { email: true } },
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    const data = rows.map((r) => {
      const after = (r.after ?? null) as { method?: string; status?: number } | null;
      return {
        id: r.id,
        at: r.at,
        tenant_id: r.tenant_id,
        tenant_slug: r.tenant?.slug ?? null,
        tenant_name: r.tenant?.name ?? null,
        congregation_id: r.congregation_id,
        actor_user_id: r.actor_user_id,
        actor_email: r.actorUser?.email ?? null,
        route: r.entity,
        method: after?.method ?? null,
        status: after?.status ?? null,
        ip: r.ip,
        user_agent: r.user_agent,
      };
    });

    return { data, total, page, limit };
  }
}
