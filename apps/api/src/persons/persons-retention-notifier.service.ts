import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

interface UpcomingRetentionRow {
  tenant_id: string;
  congregation_id: string;
  upcoming: bigint;
}

/**
 * Item 4 da seção 5.1 do mapeamento LGPD: avisa o admin da congregação
 * quando há pessoas a 7 dias ou menos de qualquer um dos quatro prazos de
 * retenção (soft delete, inatividade, financeiro pós-contrato, menor
 * pós-contrato) — a eliminação em si não depende deste aviso, é só o que
 * dá ao admin uma chance de agir antes.
 */
@Injectable()
export class PersonsRetentionNotifier {
  private readonly logger = new Logger(PersonsRetentionNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 8 * * 1')
  async cronNotifyUpcomingRetentions(): Promise<void> {
    const rows = await this.upcomingRetentionsByCongregation();

    for (const { tenant_id, congregation_id, upcoming } of rows) {
      try {
        await this.notifications.sendPush({
          tenantId: tenant_id,
          congregationId: congregation_id,
          contentPostId: null,
          title: 'Dados próximos do prazo de retenção',
          body: `${upcoming} pessoa(s) da sua congregação atingem o prazo de retenção de dados nos próximos 7 dias.`,
          filters: [
            { field: 'tag', key: 'tenant_id', relation: '=', value: tenant_id },
            { field: 'tag', key: 'congregation_id', relation: '=', value: congregation_id },
            { field: 'tag', key: 'role', relation: '=', value: 'admin_congregation' },
          ],
          data: { type: 'retention_upcoming' },
        });
      } catch (err) {
        this.logger.error(`Falha ao notificar congregação ${congregation_id}: ${String(err)}`);
      }
    }

    this.logger.log(`Notificação de retenção: ${rows.length} congregação(ões) avisada(s)`);
  }

  private async upcomingRetentionsByCongregation(): Promise<UpcomingRetentionRow[]> {
    return this.prisma.system.$queryRaw<UpcomingRetentionRow[]>(Prisma.sql`
      SELECT tenant_id, congregation_id, count(*) AS upcoming
      FROM (
        -- soft delete explícito: 30 dias após deleted_at
        SELECT p.tenant_id, p.congregation_id, p.id
        FROM persons p
        WHERE p.anonymized_at IS NULL
          AND p.deleted_at IS NOT NULL
          AND p.deleted_at + INTERVAL '30 days' BETWEEN now() AND now() + INTERVAL '7 days'

        UNION ALL

        -- inatividade: 1 ano (visitante) / 2 anos (demais), sem doação
        SELECT p.tenant_id, p.congregation_id, p.id
        FROM persons p
        WHERE p.deleted_at IS NULL
          AND p.anonymized_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM financial_transactions ft WHERE ft.donor_person_id = p.id)
          AND GREATEST(
            p.updated_at,
            COALESCE((SELECT MAX(v.visited_at) FROM visit_records v WHERE v.person_id = p.id), p.created_at),
            COALESCE((SELECT MAX(a.checked_in_at) FROM attendance_records a WHERE a.person_id = p.id), p.created_at)
          ) + (CASE WHEN p.classification = 'visitor' THEN INTERVAL '1 year' ELSE INTERVAL '2 years' END)
            BETWEEN now() AND now() + INTERVAL '7 days'

        UNION ALL

        -- financeiro: 5 anos após o fim do contrato do tenant, doador
        -- (financial_transactions OU pix_payments — um pix pendente nunca
        -- vira transação, mas ainda é vínculo financeiro)
        SELECT p.tenant_id, p.congregation_id, p.id
        FROM persons p
        JOIN tenant_plans tp ON tp.tenant_id = p.tenant_id
        WHERE p.anonymized_at IS NULL
          AND tp.cancelled_at IS NOT NULL
          AND tp.cancelled_at + INTERVAL '5 years' BETWEEN now() AND now() + INTERVAL '7 days'
          AND (
            EXISTS (SELECT 1 FROM financial_transactions ft WHERE ft.donor_person_id = p.id)
            OR EXISTS (SELECT 1 FROM pix_payments pp WHERE pp.donor_person_id = p.id)
          )

        UNION ALL

        -- menor de idade: 30 dias após o fim do contrato do tenant, sem
        -- exclusão explícita em andamento e sem doação
        SELECT p.tenant_id, p.congregation_id, p.id
        FROM persons p
        JOIN tenant_plans tp ON tp.tenant_id = p.tenant_id
        WHERE p.deleted_at IS NULL
          AND p.anonymized_at IS NULL
          AND p.birth_date IS NOT NULL
          AND p.birth_date > now() - INTERVAL '18 years'
          AND tp.cancelled_at IS NOT NULL
          AND tp.cancelled_at + INTERVAL '30 days' BETWEEN now() AND now() + INTERVAL '7 days'
          AND NOT EXISTS (
            SELECT 1 FROM financial_transactions ft WHERE ft.donor_person_id = p.id
            UNION ALL
            SELECT 1 FROM pix_payments pp WHERE pp.donor_person_id = p.id
          )
      ) upcoming_persons
      GROUP BY tenant_id, congregation_id
    `);
  }
}
