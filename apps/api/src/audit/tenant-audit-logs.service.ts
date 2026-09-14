import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListTenantAuditLogsQueryDto,
  TENANT_AUDIT_ACTIONS,
} from './dto/list-tenant-audit-logs-query.dto';

export interface TenantAuditLogItem {
  id: string;
  at: Date;
  action: string;
  entity: string;
  congregation_id: string | null;
  actor_user_id: string;
  /** Nome congelado no momento do registro (`actor_name_snapshot`, AD-004). */
  actor_name: string | null;
  /** Só em `support_access`: a rota, o método e o status da requisição. */
  route: string | null;
  method: string | null;
  status: number | null;
}

export interface TenantAuditLogPage {
  data: TenantAuditLogItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * `PROD-21` — a igreja lê a própria auditoria.
 *
 * O console de plataforma já lia `audit_logs` (`ListAuditLogsService`), mas
 * daquele lado e com a pergunta da plataforma: "o que o suporte fez, em qual
 * igreja". Aqui a pergunta é a do `tenant_admin`: "quem mexeu na minha
 * igreja". Nada de novo é gravado — o dado já estava lá desde a Fase 1, e o
 * que faltava era a leitura do lado do tenant.
 *
 * TRÊS ESCOLHAS QUE VALE REGISTRAR
 *
 * 1. **O nome do autor sai de `actor_name_snapshot`, e não de um join.** Não é
 *    economia de query: sob o RLS do tenant, `user_accounts` só mostra conta
 *    do próprio tenant, e os dois autores que aparecem aqui tipicamente não
 *    estão nele — o `platform_support` de uma linha `support_access` nunca
 *    esteve, e a conta de um `tenant_transfer` acabou de sair. O join voltaria
 *    vazio justamente nas linhas que mais importam. O snapshot (AD-004) existe
 *    para isso.
 *
 * 2. **`platform_access` fica fora**, pelo filtro fechado do DTO. Aquela linha
 *    tem `tenant_id` preenchido — o tenant de origem do usuário de suporte,
 *    porque `audit_logs.tenant_id` é NOT NULL com FK (ver `CLAUDE.md`) — e não
 *    tem relação nenhuma com a igreja que a hospeda. Sem o filtro, a igreja
 *    onde a conta de suporte está cadastrada leria a operação da plataforma
 *    inteira. O RLS não pode barrar isso: para ele a linha é do tenant.
 *
 * 3. **`ip` e `user_agent` não são devolvidos.** Existem na tabela e o console
 *    os mostra, onde são rastro de quem opera a plataforma para quem responde
 *    por ela. Devolvê-los aqui entregaria o IP do funcionário do suporte ao
 *    cliente, e a pergunta desta tela — quem, quando, o quê — se responde sem
 *    eles.
 *
 * O recorte por tenant é do RLS (`tenant_read` em `audit_logs`, 001/005). O
 * `tenant_id` no `where` é redundância deliberada, o mesmo padrão dos demais
 * serviços: se alguém rodar isto fora do `TenantContextInterceptor`, a
 * consulta erra para o lado de não devolver nada.
 */
@Injectable()
export class TenantAuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    query: ListTenantAuditLogsQueryDto,
  ): Promise<TenantAuditLogPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const at = buildRange(query.from, query.to);
    const where: Prisma.AuditLogWhereInput = {
      tenant_id: tenantId,
      action: query.action ?? { in: [...TENANT_AUDIT_ACTIONS] },
      ...(at ? { at } : {}),
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
          congregation_id: true,
          actor_user_id: true,
          actor_name_snapshot: true,
          after: true,
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    const data = rows.map((r) => {
      // O formato de `after` é de quem escreveu a linha, não desta tela:
      // `AuditInterceptor` grava `{ route, method, status }`, e
      // `TransferUserAccountService` grava o par de tenant/congregação. Só o
      // primeiro tem o que mostrar aqui.
      const after = (r.after ?? null) as
        | { route?: string; method?: string; status?: number }
        | null;
      const isRequest = r.action === 'support_access';

      return {
        id: r.id,
        at: r.at,
        action: r.action,
        entity: r.entity,
        congregation_id: r.congregation_id,
        actor_user_id: r.actor_user_id,
        actor_name: r.actor_name_snapshot,
        route: isRequest ? (after?.route ?? r.entity) : null,
        method: isRequest ? (after?.method ?? null) : null,
        status: isRequest ? (after?.status ?? null) : null,
      };
    });

    return { data, total, page, limit };
  }
}

/**
 * A janela de datas, ou `undefined` quando não veio nenhuma ponta.
 *
 * `to` é inclusivo, e quem digita "14/09" quer o dia 14 inteiro — por isso a
 * data pura vira `< 15/09`, e não `<= 14/09T00:00`, que devolveria zero linha
 * para o dia mais provável de ser consultado: o de hoje. Instante completo
 * (com hora) é comparado como veio.
 */
function buildRange(
  from?: string,
  to?: string,
): Prisma.DateTimeFilter | undefined {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  const range: Prisma.DateTimeFilter = {};

  if (from) range.gte = new Date(from);
  if (to) {
    if (dateOnly.test(to)) {
      const end = new Date(`${to}T00:00:00.000Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      range.lt = end;
    } else {
      range.lte = new Date(to);
    }
  }

  return from || to ? range : undefined;
}
