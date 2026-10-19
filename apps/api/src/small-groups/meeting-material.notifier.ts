import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MaterialVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, OneSignalFilter, orGroup } from '../content/notifications.service';

// Limite de filtros por chamada do OneSignal é 200 (cada pessoa = 1 filtro +
// 1 operador OR); em lotes de 90 sobra folga.
const BATCH_SIZE = 90;

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

  @Cron('*/10 * * * *')
  async cronNotifyReleased(): Promise<void> {
    const pending = await this.prisma.system.groupMeetingMaterial.findMany({
      where: { notified_at: null, release_at: { lte: new Date() } },
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

      for (let i = 0; i < members.length; i += BATCH_SIZE) {
        const filters: OneSignalFilter[] = orGroup(
          members.slice(i, i + BATCH_SIZE).map((m) => ({
            field: 'tag' as const,
            key: 'person_id',
            relation: '=' as const,
            value: m.person_id,
          })),
        );
        await this.notifications.sendPush({
          tenantId: group.tenant_id,
          congregationId: group.congregation_id,
          contentPostId: null,
          title: `Material do encontro — ${group.name}`,
          body: `${link.material.title} já está disponível.`,
          filters,
          data: {
            type: 'meeting_material',
            small_group_id: link.meeting.small_group_id,
            meeting_id: link.meeting_id,
            material_id: link.material_id,
          },
        });
      }

      await this.prisma.system.groupMeetingMaterial.update({
        where: { id: linkId },
        data: { notified_at: new Date() },
      });
    } catch (err) {
      // Aviso é best-effort: falhar não pode desfazer o vínculo. O cron tenta
      // de novo no próximo ciclo enquanto `notified_at` seguir nulo.
      this.logger.error(`Falha ao avisar o material do vínculo ${linkId}: ${String(err)}`);
    }
  }
}
