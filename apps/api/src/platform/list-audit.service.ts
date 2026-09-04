import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditQueryDto, PLATFORM_ACTIONS } from './dto/list-audit-query.dto';

export interface AuditListItem {
  id: string;
  at: Date;
  action: string;
  entity: string;
  tenant_id: string;
  tenant_name: string;
  actor_user_id: string;
  actor_email: string | null;
  ip: string | null;
}

export interface AuditListPage {
  data: AuditListItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * O rastro que a plataforma deixa de si mesma.
 *
 * O `AuditInterceptor` grava `support_access` e `platform_access` desde a Fase
 * 2, e até aqui ninguém tinha como olhar: a policy `tenant_read` de 001 dizia
 * `tenant_id = app_current_tenant()`, e rota de plataforma roda sem tenant no
 * contexto. Quem abriu o caminho foi `005_rls_audit_platform.sql`.
 *
 * O ramo de lá é estreito de propósito — só estas duas ações — então este
 * serviço **não** precisa filtrar por ação para estar correto: o banco já não
 * devolve outra coisa. O `action IN` do `where` é conveniência de consulta e
 * documentação do que se espera, nunca o controle. Se um dia parecer que ele é
 * o que protege, a leitura certa é que 005 não rodou.
 *
 * Sem `@PlatformRoute()` no controller o `IS NULL` de `app_platform_access()`
 * fecha e isto devolve zero linhas, sem erro nenhum. Lista vazia aqui é
 * sintoma de contexto ou de script não aplicado, não de nada ter acontecido.
 */
@Injectable()
export class ListAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditQueryDto): Promise<AuditListPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const at: Prisma.DateTimeFilter = {};
    if (query.from) at.gte = new Date(query.from);
    if (query.to) at.lte = new Date(query.to);

    const where: Prisma.AuditLogWhereInput = {
      action: query.action ? query.action : { in: [...PLATFORM_ACTIONS] },
      ...(query.tenant_id ? { tenant_id: query.tenant_id } : {}),
      ...(query.from || query.to ? { at } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          at: true,
          action: true,
          entity: true,
          tenant_id: true,
          actor_user_id: true,
          ip: true,
          tenant: { select: { name: true } },
          actorUser: { select: { email: true } },
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    // `before` e `after` ficam fora. A listagem responde "quem entrou onde e
    // quando"; o conteúdo da alteração é dado da igreja, e trazê-lo para uma
    // tela de plataforma seria abrir pela porta lateral o que 005 fecha pela
    // da frente.
    const data = rows.map((r) => ({
      id: r.id,
      at: r.at,
      action: r.action,
      entity: r.entity,
      tenant_id: r.tenant_id,
      tenant_name: r.tenant.name,
      actor_user_id: r.actor_user_id,
      actor_email: r.actorUser?.email ?? null,
      ip: r.ip,
    }));

    return { data, total, page, limit };
  }
}
