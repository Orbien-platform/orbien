import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../content/notifications.service';

type NoticeInfo = { checkinId: string; sessionId: string; childId: string; roomName: string };

/**
 * Push do Kids aos responsáveis (categoria própria `kids`: a preferência vive
 * em tag OneSignal e o filtro usa `!=` — AD-003 — então sem a tag conta como
 * ligado). O destino é a tag `person_id`, como no aviso de escala, e só quem
 * tem conta ativa entra na lista.
 *
 * - **Criança entregue** (check-out e override): ao responsável primário e aos
 *   demais com `can_pickup` que tenham conta, menos a pessoa que retirou.
 * - **Criança recebida** (check-in, R3-3): ao responsável primário quando o
 *   check-in foi feito por OUTRA pessoa (equipe ou terceiro) — nunca ao próprio
 *   primário que o fez.
 *
 * O texto leva o primeiro nome e a turma; saúde nunca entra (a ficha de saúde
 * nem é consultada). Best-effort: falha daqui nunca desfaz nem atrasa o
 * check-in/out com erro.
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
    info: NoticeInfo & { pickedUpByPersonId: string | null },
  ): Promise<void> {
    await this.notify(tenantId, congregationId, info, {
      guardianFilter: [{ is_primary: true }, { can_pickup: true }],
      exclude: info.pickedUpByPersonId,
      title: () => 'Criança entregue',
      body: (firstName) => `Retirada de ${firstName} confirmada na turma ${info.roomName}.`,
      type: 'kids_child_released',
    });
  }

  /**
   * `actorPersonId`: a pessoa (do cadastro) da conta que fez o check-in, ou
   * `null` se a conta não tem pessoa. Se for o próprio primário, ele não é avisado.
   */
  async notifyChildReceived(
    tenantId: string,
    congregationId: string,
    info: NoticeInfo & { actorPersonId: string | null },
  ): Promise<void> {
    await this.notify(tenantId, congregationId, info, {
      guardianFilter: [{ is_primary: true }],
      exclude: info.actorPersonId,
      title: () => `Criança recebida na turma ${info.roomName}`,
      body: (firstName) => `${firstName} acabou de ser recebido(a) na turma ${info.roomName}.`,
      type: 'kids_child_received',
    });
  }

  private async notify(
    tenantId: string,
    congregationId: string,
    info: NoticeInfo,
    msg: {
      guardianFilter: Record<string, boolean>[];
      exclude: string | null;
      title: () => string;
      body: (firstName: string) => string;
      type: string;
    },
  ): Promise<void> {
    try {
      const guardians = await this.prisma.client.kidsGuardian.findMany({
        where: { child_id: info.childId, tenant_id: tenantId, congregation_id: congregationId, OR: msg.guardianFilter },
        select: { guardian_person_id: true },
      });
      const candidates = [...new Set(guardians.map((g) => g.guardian_person_id))].filter((id) => id !== msg.exclude);
      if (candidates.length === 0) return;

      // Só quem tem conta ativa: sem conta não há aparelho nem tag a notificar.
      const accounts = await this.prisma.client.userAccount.findMany({
        where: { tenant_id: tenantId, person_id: { in: candidates }, is_active: true },
        select: { person_id: true },
      });
      const withAccount = new Set(accounts.map((a) => a.person_id));
      const recipients = candidates.filter((id) => withAccount.has(id));
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
            title: msg.title(),
            body: msg.body(firstName),
            filters: [
              { field: 'tag', key: 'person_id', relation: '=', value: personId },
              { field: 'tag', key: 'pref_kids', relation: '!=', value: 'false' },
            ],
            data: { type: msg.type, checkin_id: info.checkinId, session_id: info.sessionId, child_id: info.childId },
          });
        } catch (err) {
          this.logger.error(`falha ao avisar (${msg.type}) o check-in ${info.checkinId}: ${String(err)}`);
        }
      }
    } catch (err) {
      this.logger.error(`falha ao avisar (${msg.type}) o check-in ${info.checkinId}: ${String(err)}`);
    }
  }
}
