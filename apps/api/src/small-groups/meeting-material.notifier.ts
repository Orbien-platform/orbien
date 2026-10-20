import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MaterialVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Avisa por push os inscritos no PG quando um material de encontro é liberado.
 * Diferente do `StudyMaterialsService.publishPending` (tag da congregação
 * inteira), aqui o público é o PG do encontro: todos os membros quando o
 * vínculo é `all`, só quem tem papel de liderança no PG (`leader`/`trainee`)
 * quando é `leaders_only`.
 *
 * Roda como `prisma.system` — cron sem tenant no contexto —, mas `notifyLink`
 * também é chamado de dentro de um request (vínculo imediato) e usa o mesmo
 * cliente por isso: a consulta é por id do vínculo, já validado pelo caller.
 */
@Injectable()
export class MeetingMaterialNotifier {
  private readonly logger = new Logger(MeetingMaterialNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // Só vínculos agendados cuja hora chegou nas últimas 24h: é o que o cron
  // cobre. Vínculo imediato avisa no próprio request e, se o envio falhar, não
  // é retentado aqui (`release_at` nulo); e aviso atrasado por mais de um dia
  // já não é novidade — a janela impede a retentativa eterna de um envio que
  // não passa.
  @Cron('*/10 * * * *')
  async cronNotifyReleased(): Promise<void> {
    if (!process.env['ONESIGNAL_APP_ID']) return;

    const now = Date.now();
    const pending = await this.prisma.system.groupMeetingMaterial.findMany({
      where: {
        notified_at: null,
        release_at: { lte: new Date(now), gte: new Date(now - DAY_MS) },
      },
      select: { id: true },
      take: 200,
    });
    for (const link of pending) await this.notifyLink(link.id);
  }

  /** Idempotente: `notified_at` fecha o vínculo para qualquer outro disparo. */
  async notifyLink(linkId: string): Promise<void> {
    try {
      const link = await this.prisma.system.groupMeetingMaterial.findUnique({
        where: { id: linkId },
        include: {
          material: { select: { title: true } },
          meeting: {
            select: {
              small_group_id: true,
              smallGroup: { select: { name: true, tenant_id: true, congregation_id: true } },
            },
          },
        },
      });
      if (!link || link.notified_at) return;

      const group = link.meeting.smallGroup;
      const members = await this.prisma.system.groupMembership.findMany({
        where: {
          small_group_id: link.meeting.small_group_id,
          ...(link.visibility === MaterialVisibility.leaders_only
            ? { role: { in: ['leader', 'trainee'] } }
            : {}),
        },
        select: { person_id: true },
      });

      const delivered = await this.notifications.sendPushToPersons(
        {
          tenantId: group.tenant_id,
          congregationId: group.congregation_id,
          contentPostId: null,
          title: `Material do encontro — ${group.name}`,
          body: `${link.material.title} já está disponível.`,
          data: {
            type: 'meeting_material',
            small_group_id: link.meeting.small_group_id,
            meeting_id: link.meeting_id,
            material_id: link.material_id,
          },
        },
        members.map((m) => m.person_id),
      );
      if (!delivered) {
        this.logger.warn(`OneSignal não aceitou o aviso do vínculo ${linkId}`);
        return;
      }

      await this.prisma.system.groupMeetingMaterial.update({
        where: { id: linkId },
        data: { notified_at: new Date() },
      });
    } catch (err) {
      // Aviso é best-effort: falhar não pode desfazer o vínculo. `notified_at`
      // fica nulo, e o cron tenta de novo se o vínculo for agendado e ainda
      // estiver na janela de 24h.
      this.logger.error(`Falha ao avisar o material do vínculo ${linkId}: ${String(err)}`);
    }
  }
}
