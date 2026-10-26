import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../content/notifications.service';
import { KIDS_ALERT_ROLES } from '../kids.roles';

/**
 * Aviso ao líder quando uma retirada é recusada (AC 7). Best-effort: a recusa
 * já está em `audit_logs`, e uma falha do OneSignal não pode virar 500 nem
 * mudar a resposta do balcão. A push leva a turma, nunca o nome da criança.
 */
@Injectable()
export class KidsLeaderAlertService {
  private readonly logger = new Logger(KidsLeaderAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyCheckoutDenied(
    tenantId: string,
    congregationId: string,
    info: { sessionId: string; checkinId: string; roomName: string },
  ): Promise<void> {
    try {
      const rows = await this.prisma.client.roleAssignment.findMany({
        where: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          role_code: { in: KIDS_ALERT_ROLES },
          userAccount: { is_active: true },
        },
        select: { userAccount: { select: { person_id: true } } },
      });
      const personIds = [...new Set(rows.map((r) => r.userAccount.person_id).filter((id): id is string => !!id))];
      if (personIds.length === 0) return;

      await this.notifications.sendPushToPersons(
        {
          tenantId,
          congregationId,
          contentPostId: null,
          title: 'Retirada recusada no Kids',
          body: `Alguém tentou retirar uma criança da turma ${info.roomName} sem passar na conferência. Vá ao balcão.`,
          data: { type: 'kids_checkout_denied', session_id: info.sessionId, checkin_id: info.checkinId },
        },
        personIds,
      );
    } catch (err) {
      this.logger.error(`falha ao avisar o líder da retirada recusada ${info.checkinId}: ${String(err)}`);
    }
  }
}
