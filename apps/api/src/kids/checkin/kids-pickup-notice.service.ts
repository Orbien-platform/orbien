import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../content/notifications.service';

/**
 * Push "Criança entregue" ao responsável primário quando o check-out fecha
 * (inclui o override). Categoria própria `kids`: a preferência vive em tag
 * OneSignal e o filtro usa `!=` (AD-003) — sem a tag, conta como ligado. O
 * destino é a tag `person_id`, como no aviso de escala.
 *
 * O texto leva o primeiro nome e a turma; saúde nunca entra (a ficha de saúde
 * nem é consultada). Quem retirou a criança não precisa do aviso. Best-effort:
 * falha daqui nunca desfaz nem atrasa o check-out com erro.
 */
@Injectable()
export class KidsPickupNoticeService {
  private readonly logger = new Logger(KidsPickupNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyChildReleased(
    tenantId: string,
    congregationId: string,
    info: { checkinId: string; sessionId: string; childId: string; roomName: string; pickedUpByPersonId: string | null },
  ): Promise<void> {
    try {
      const primaries = await this.prisma.client.kidsGuardian.findMany({
        where: { child_id: info.childId, tenant_id: tenantId, congregation_id: congregationId, is_primary: true },
        select: { guardian_person_id: true },
      });
      const recipients = [...new Set(primaries.map((g) => g.guardian_person_id))].filter(
        (id) => id !== info.pickedUpByPersonId,
      );
      if (recipients.length === 0) return;

      const child = await this.prisma.client.person.findFirst({
        where: { id: info.childId, tenant_id: tenantId, congregation_id: congregationId },
        select: { full_name: true },
      });
      if (!child) return;
      const firstName = child.full_name.trim().split(/\s+/)[0];

      for (const personId of recipients) {
        try {
          await this.notifications.sendPush({
            tenantId,
            congregationId,
            contentPostId: null,
            title: 'Criança entregue',
            body: `Retirada de ${firstName} confirmada na turma ${info.roomName}.`,
            filters: [
              { field: 'tag', key: 'person_id', relation: '=', value: personId },
              { field: 'tag', key: 'pref_kids', relation: '!=', value: 'false' },
            ],
            data: { type: 'kids_child_released', checkin_id: info.checkinId, session_id: info.sessionId },
          });
        } catch (err) {
          this.logger.error(`falha ao avisar a entrega do check-in ${info.checkinId}: ${String(err)}`);
        }
      }
    } catch (err) {
      this.logger.error(`falha ao avisar a entrega do check-in ${info.checkinId}: ${String(err)}`);
    }
  }
}
